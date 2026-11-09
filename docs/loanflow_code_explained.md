# LoanFlow — Code Explained, Service by Service

---

## `loanflow-common` — The Shared Contract

Before any service, understand this module. It's a Maven dependency that **all services share**. It defines the "language" services use to talk through Kafka.

### Events — The Messages Passed via Kafka

All events are pure Java POJOs using Lombok:

```java
// ApplicationSubmittedEvent.java
@Data @NoArgsConstructor @AllArgsConstructor @Builder
public class ApplicationSubmittedEvent {
    private Long applicationId;     // Primary key of the saved LoanApplication
    private Long applicantId;       // Primary key of the Applicant user
    private String applicantName;
    private String applicantEmail;
    private String ssn;             // Social Security Number — drives bureau score lookup
    private BigDecimal monthlyIncome; // Used to compute DTI ratio
    private BigDecimal requestedAmount;
    private Integer loanTermMonths;
    private String kycDocumentRef;
    private LocalDateTime timestamp;
}
```

**Why a shared module?** The producer (application-service) and consumer (credit-scoring-service) must agree on the exact same class structure for Jackson to serialize/deserialize the JSON. Instead of copy-pasting, they both import `loanflow-common` as a Maven dependency.

**The 4 events form the entire pipeline contract:**

| Event Class | Produced By | Consumed By | Key Fields Added |
|---|---|---|---|
| `ApplicationSubmittedEvent` | application-service | credit-scoring-service | ssn, monthlyIncome |
| `CreditScoredEvent` | credit-scoring-service | underwriting-service | creditScore, creditTier, debtToIncomeRatio, isFallbackUsed |
| `UnderwritingDecidedEvent` | underwriting-service | disbursement-service | status, approvedAmount, interestRate, decisionNotes |
| `DisbursedEvent` | disbursement-service | notification-service | transactionRef, bankAccountNumber |

Each event builds on the previous — you can trace a loan's full journey by correlating events on `applicationId`.

---

## Service 1: `application-service` (Port 8081)

**What it owns:** User identity, auth, loan intake.

### Layer 1 — Entities (JPA / Database Tables)

**[`Applicant.java`](file:///c:/PROJECTS/LoanFlow/application-service/src/main/java/com/loanflow/application/entity/Applicant.java)**
```java
@Entity
@Table(name = "applicants")   // maps this class to the "applicants" DB table
public class Applicant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)  // auto-increment primary key
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;       // used as the login username

    @Column(name = "password_hash", nullable = false)
    private String passwordHash; // BCrypt hash — NEVER stores raw password

    @Column(nullable = false)
    private String ssn;          // updated at loan submission time

    @Column(name = "monthly_income")
    private BigDecimal monthlyIncome; // updated at loan submission time

    @Enumerated(EnumType.STRING)  // stores the enum NAME ("APPLICANT") not ordinal (0)
    @Builder.Default
    private UserRole role = UserRole.APPLICANT;

    @CreationTimestamp              // auto-set by Hibernate on INSERT
    private LocalDateTime createdAt;
}
```

> `@Enumerated(EnumType.STRING)` is a best practice — if you reorder the enum, the DB values remain valid string names rather than broken integer ordinals.

**[`LoanApplication.java`](file:///c:/PROJECTS/LoanFlow/application-service/src/main/java/com/loanflow/application/entity/LoanApplication.java)**
```java
@Entity
@Table(name = "loan_applications")
public class LoanApplication {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "applicant_id", nullable = false)
    private Applicant applicant;   // FK to applicants table; LAZY = not loaded unless accessed
    
    private BigDecimal requestedAmount;
    private Integer loanTermMonths;
    private String kycDocumentRef; // reference to an uploaded KYC document (mock)

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ApplicationStatus status = ApplicationStatus.SUBMITTED; // initial state

    @CreationTimestamp private LocalDateTime createdAt;
    @UpdateTimestamp   private LocalDateTime updatedAt; // auto-updated on every save
}
```

> `FetchType.LAZY` means Hibernate won't join-fetch the Applicant when loading a LoanApplication unless you explicitly access `app.getApplicant()`. This is the performant default — avoids unnecessary DB queries.

---

### Layer 2 — Security

**[`JwtTokenProvider.java`](file:///c:/PROJECTS/LoanFlow/application-service/src/main/java/com/loanflow/application/security/JwtTokenProvider.java)** — Generates and validates JWT tokens.

```java
@Value("${jwt.secret:404E635266...}")  // reads from application.yml, with a default fallback
private String jwtSecret;

@Value("${jwt.expiration-ms:86400000}") // 86400000ms = 24 hours
private long jwtExpirationMs;

private SecretKey getSigningKey() {
    byte[] keyBytes = Decoders.BASE64.decode(jwtSecret); // decode the hex secret
    return Keys.hmacShaKeyFor(keyBytes);                 // build HMAC-SHA256 key
}

public String generateToken(String email, Long applicantId, String role) {
    return Jwts.builder()
            .subject(email)                      // "sub" claim = who this token is for
            .claim("applicantId", applicantId)   // custom claim embedded in token payload
            .claim("role", role)
            .issuedAt(new Date())
            .expiration(new Date(now + jwtExpirationMs))
            .signWith(getSigningKey())            // HMAC-SHA256 signature prevents tampering
            .compact();                          // produces the Base64-encoded JWT string
}

public String getEmailFromToken(String token) {
    // Parse + verify signature, then extract the "sub" claim
    return claims.getSubject();
}

public boolean validateToken(String token) {
    try {
        Jwts.parser().verifyWith(getSigningKey()).build().parseSignedClaims(token);
        return true;
    } catch (Exception e) {
        return false;  // expired, tampered, or malformed — all fail silently
    }
}
```

> A JWT is three Base64 segments separated by `.`: `header.payload.signature`. The signature is computed with the secret key. Anyone can *read* the payload but can't *forge* a token without the secret.

---

**[`JwtAuthenticationFilter.java`](file:///c:/PROJECTS/LoanFlow/application-service/src/main/java/com/loanflow/application/security/JwtAuthenticationFilter.java)** — Runs on every HTTP request.

```java
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    // OncePerRequestFilter guarantees it runs exactly once per request,
    // even in forwarded/async scenarios.

    @Override
    protected void doFilterInternal(request, response, filterChain) {
        String token = getJwtFromRequest(request);
        //   reads "Authorization: Bearer <token>" header, strips "Bearer " prefix

        if (StringUtils.hasText(token) && tokenProvider.validateToken(token)) {
            String email = tokenProvider.getEmailFromToken(token);
            var userDetails = userDetailsService.loadUserByUsername(email);
            // loads the Applicant from DB to verify they still exist

            UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(authentication);
            // sets the identity for this request — now @AuthenticationPrincipal works
        }

        filterChain.doFilter(request, response); // always passes to next filter/controller
    }
}
```

> `SecurityContextHolder` is a thread-local store. Setting the authentication here means any downstream component in the same request thread can call `SecurityContextHolder.getContext().getAuthentication()` to know who the user is.

---

**[`SecurityConfig.java`](file:///c:/PROJECTS/LoanFlow/application-service/src/main/java/com/loanflow/application/security/SecurityConfig.java)** — Spring's security routing table.

```java
http
  .cors(...)          // allow cross-origin requests (frontend on :3000 → API on :8081)
  .csrf(disable)      // disabled because we use JWT, not cookies (no CSRF risk)
  .authorizeHttpRequests(auth -> auth
      .requestMatchers("/api/v1/auth/**").permitAll()          // login/register = public
      .requestMatchers("/api/v1/applications/all").permitAll() // dashboard list = public
      .anyRequest().authenticated()                            // everything else = JWT required
  )
  .sessionManagement(STATELESS)  // no server-side sessions; each request is self-contained
  .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
  // our JWT filter runs BEFORE Spring's default username/password filter
```

---

### Layer 3 — Controller & Service

**[`LoanApplicationController.java`](file:///c:/PROJECTS/LoanFlow/application-service/src/main/java/com/loanflow/application/controller/LoanApplicationController.java)**

```java
@PostMapping
public ResponseEntity<ApiResponse<LoanApplicationResponse>> submitApplication(
        @Valid @RequestBody LoanApplicationRequest request,
        @AuthenticationPrincipal UserDetails userDetails) {
    // @Valid triggers Bean Validation (e.g., @NotNull on request fields)
    // @AuthenticationPrincipal extracts the logged-in user from SecurityContextHolder
    // userDetails.getUsername() returns the email (the "subject" we put in the JWT)

    LoanApplicationResponse response = applicationService.submitApplication(request, userDetails.getUsername());
    return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(...));
}
```

**[`LoanApplicationServiceImpl.java`](file:///c:/PROJECTS/LoanFlow/application-service/src/main/java/com/loanflow/application/service/impl/LoanApplicationServiceImpl.java)** — The core business logic:

```java
@Transactional  // wraps the entire method in a DB transaction
public LoanApplicationResponse submitApplication(request, applicantEmail) {
    
    // Step 1: Find the user by email (from JWT)
    Applicant applicant = applicantRepository.findByEmail(applicantEmail).orElseThrow(...);

    // Step 2: Update SSN and income from the submitted form
    // This was the critical fix — without this, all users kept their registration defaults
    if (request.getSsn() != null && !request.getSsn().isBlank()) {
        applicant.setSsn(request.getSsn().trim());
    }
    if (request.getMonthlyIncome() != null && request.getMonthlyIncome() > 0) {
        applicant.setMonthlyIncome(request.getMonthlyIncome());
    }
    applicantRepository.save(applicant); // flush updated SSN/income to DB

    // Step 3: Create the loan application record
    LoanApplication application = LoanApplication.builder()
            .applicant(applicant)
            .requestedAmount(request.getRequestedAmount())
            .status(ApplicationStatus.SUBMITTED)
            .build();
    LoanApplication saved = applicationRepository.save(application);

    // Step 4: Build the Kafka event — packages all data the downstream services need
    ApplicationSubmittedEvent event = ApplicationSubmittedEvent.builder()
            .applicationId(saved.getId())
            .ssn(applicant.getSsn())           // flows to credit bureau lookup
            .monthlyIncome(applicant.getMonthlyIncome()) // flows to DTI calculation
            .requestedAmount(saved.getRequestedAmount())
            .build();

    // Step 5: Publish — fire and forget. Returns immediately.
    // The key (saved.getId().toString()) routes this message to a deterministic partition
    kafkaTemplate.send("loan-application-submitted", saved.getId().toString(), event);

    return mapToResponse(saved); // 201 Created returned to frontend
}
```

---

## Service 2: `credit-scoring-service` (Port 8082)

**What it owns:** Translating a submitted event into a numerical credit score.

### `ExternalCreditBureauClientImpl.java`

```java
public int fetchScoreFromBureau(String ssn) {
    
    // Simulate a real bureau being unavailable
    // SSNs ending in "9999" trigger a 503 — used to test the circuit breaker
    if (ssn != null && ssn.endsWith("9999")) {
        throw new RuntimeException("External Credit Bureau API Connection Timeout (503)");
    }

    // Deterministic scoring: same SSN always returns same base score
    // ssn.hashCode() gives an integer hash of the string
    // % 250 = remainder when divided by 250, so result is 0–249
    // Math.abs prevents negative hash values
    // + 600 shifts range to 600–849
    // Math.min(850, ...) caps at 850
    int baseScore = 600 + Math.abs(ssn.hashCode() % 250);
    return Math.min(850, Math.max(300, baseScore));

    // maskSsn hides all but last 4 digits in logs: "123-45-6789" → "***-**-6789"
}
```

### `CreditScoringServiceImpl.java`

```java
@CircuitBreaker(name = "creditBureauService", fallbackMethod = "fallbackCreditEvaluation")
public CreditScoredEvent processCreditEvaluation(ApplicationSubmittedEvent event) {

    // 1. Call the (mocked) bureau
    int score = bureauClient.fetchScoreFromBureau(event.getSsn());

    // 2. Compute DTI = (loan * 0.05) / monthlyIncome
    // 5% of loan = estimated monthly payment (rough approximation)
    BigDecimal dtiRatio = calculateDti(event.getMonthlyIncome(), event.getRequestedAmount());

    // 3. Adjust score based on financial health
    if (dtiRatio <= 0.20) {
        score = Math.min(850, score + 70); // Low debt burden → big boost
    } else if (dtiRatio > 0.45) {
        score = Math.max(350, score - 60); // High debt burden → penalty
    }
    // 0.20 < DTI ≤ 0.45 → neutral, score unchanged

    // 4. Map score to tier
    CreditTier tier = calculateTier(score); // EXCELLENT ≥750, GOOD ≥700, FAIR ≥600, POOR <600

    // 5. Persist to this service's DB
    CreditReport report = CreditReport.builder()
            .applicationId(event.getApplicationId())
            .creditScore(score)
            .isFallbackUsed(false) // marks that the real bureau was used
            .build();
    creditReportRepository.save(report);

    // 6. Emit event to trigger underwriting
    CreditScoredEvent scored = CreditScoredEvent.builder()
            .creditScore(score)
            .creditTier(tier)
            .debtToIncomeRatio(dtiRatio)
            .isFallbackUsed(false)
            .build();
    kafkaTemplate.send("credit-scored", event.getApplicationId().toString(), scored);
    return scored;
}

// Called automatically by Resilience4j when the circuit opens
public CreditScoredEvent fallbackCreditEvaluation(ApplicationSubmittedEvent event, Throwable t) {
    // t = the exception that triggered the fallback (e.g., 503 timeout)
    int fallbackScore = 600;  // conservative: not low enough to auto-reject, not high enough to approve
    CreditTier fallbackTier = CreditTier.FAIR; // will land in MANUAL_REVIEW territory

    // isFallbackUsed = true flags this to downstream services and auditors
    // The pipeline continues unblocked — crucial for system availability
}

private BigDecimal calculateDti(BigDecimal monthlyIncome, BigDecimal requestedAmount) {
    if (monthlyIncome == null || monthlyIncome == 0) {
        return BigDecimal.valueOf(0.5); // no income info → worst-case DTI (high risk)
    }
    BigDecimal estimatedMonthlyPayment = requestedAmount.multiply(BigDecimal.valueOf(0.05));
    return estimatedMonthlyPayment.divide(monthlyIncome, 2, RoundingMode.HALF_UP);
    // HALF_UP rounding: 0.225 → 0.23 (standard banker rounding)
}
```

### `CreditScoringController.java` (the open REST layer)

```java
@GetMapping("/applications/{applicationId}")
public ResponseEntity<ApiResponse<CreditReport>> getReportByApplicationId(@PathVariable Long applicationId) {
    return creditReportRepository.findByApplicationId(applicationId)
            .map(report -> ResponseEntity.ok(ApiResponse.success(report)))
            .orElse(ResponseEntity.ok(ApiResponse.error("Credit report not found...")));
    // .map() = if Optional has a value, transform it; else take the .orElse() branch
    // Note: no @AuthenticationPrincipal here — this endpoint is unauthenticated (for demo)
}
```

> The controller has **no business logic** — it only handles HTTP concerns (path parsing, response wrapping). Business logic lives in the service. This is the standard Spring layered architecture.

---

## Service 3: `underwriting-service` (Port 8083)

**What it owns:** Final credit risk decision and human adjudication.

### `UnderwritingServiceImpl.java`

```java
@Transactional
public UnderwritingResponse evaluateAutomatedDecision(CreditScoredEvent event) {
    int score = event.getCreditScore();

    // Pure business rules — the "underwriting engine"
    if (score >= 700) {
        status = UnderwritingStatus.APPROVED;
        // Tiered interest: lower risk = cheaper loan
        interestRate = score >= 750 ? BigDecimal.valueOf(5.5) : BigDecimal.valueOf(7.5);
        notes = "Auto-approved based on credit score (" + score + ")";

    } else if (score < 550) {
        status = UnderwritingStatus.REJECTED;
        notes = "Auto-rejected: score below minimum threshold of 550";

    } else {
        // 550–699: grey zone — automated system lacks confidence
        status = UnderwritingStatus.FLAGGED_FOR_MANUAL_REVIEW;
        notes = "Flagged for manual review: requires underwriter inspection";
        // ⚠️ NO event published here — pipeline intentionally pauses
    }

    UnderwritingDecision decision = decisionRepository.save(/* ... */);

    // Only final decisions (APPROVED/REJECTED) unblock the pipeline
    if (status == APPROVED || status == REJECTED) {
        publishEvent(decision);  // → "underwriting-decided" → disbursement-service
    }
    // FLAGGED cases sit in the DB, waiting for submitManualDecision()
}

// Called by a human underwriter via POST /api/v1/underwriting/{id}/manual-decision
@Transactional
public UnderwritingResponse submitManualDecision(ManualDecisionRequest request) {
    UnderwritingDecision decision = decisionRepository
            .findByApplicationId(request.getApplicationId())
            .orElseThrow(...); // must exist from the automated step

    // Overwrite the automated values with human decision
    decision.setStatus(request.getStatus());
    decision.setApprovedAmount(request.getApprovedAmount());
    decision.setInterestRate(request.getInterestRate());
    decision.setDecisionNotes(request.getDecisionNotes());
    decision.setUnderwriterId(request.getUnderwriterId()); // audit: who made the decision

    decisionRepository.save(decision);
    publishEvent(decision); // now unblocks disbursement-service
}

private void publishEvent(UnderwritingDecision decision) {
    UnderwritingDecidedEvent event = UnderwritingDecidedEvent.builder()
            .status(decision.getStatus())
            .approvedAmount(decision.getApprovedAmount())
            .interestRate(decision.getInterestRate())
            .underwriterId(decision.getUnderwriterId()) // preserved for audit
            .build();
    kafkaTemplate.send("underwriting-decided", decision.getApplicationId().toString(), event);
}
```

---

## Service 4: `disbursement-service` (Port 8084)

**What it owns:** Moving money. This service must be bulletproof against duplicates.

### `IdempotencyLog.java` — The Deduplication Table

```java
@Entity
@Table(name = "idempotency_logs", indexes = {
    @Index(name = "idx_idempotency_key", columnList = "idempotency_key", unique = true)
    // DB-level UNIQUE constraint: even concurrent threads can't insert the same key twice
})
public class IdempotencyLog {
    @Column(name = "idempotency_key", nullable = false, unique = true)
    private String idempotencyKey;

    @Column(columnDefinition = "TEXT")    // TEXT type for large JSON payloads
    private String responsePayload;       // the serialized DisbursementResponse JSON
}
```

> The DB-level unique index is the *real* guard. If two threads race past the application-level check simultaneously, only one INSERT will succeed — the other gets a constraint violation.

### `DisbursementServiceImpl.java`

```java
@Transactional
public DisbursementResponse executeDisbursement(DisbursementRequest request, String idempotencyKey) {

    // === GUARD: Check if this key was already processed ===
    Optional<IdempotencyLog> existingLog = idempotencyLogRepository.findByIdempotencyKey(idempotencyKey);
    if (existingLog.isPresent()) {
        // Deserialize the cached JSON response from the first run
        DisbursementResponse cached = objectMapper.readValue(
            existingLog.get().getResponsePayload(),
            DisbursementResponse.class
        );
        cached.setIsDuplicateRequest(true); // tells the caller "you've seen this before"
        return cached;  // ← returns WITHOUT touching money again
    }

    // === REAL WORK: Only reached on the FIRST call ===
    String transactionRef = "TXN-" + UUID.randomUUID().toString().substring(0, 13).toUpperCase();
    // e.g., "TXN-550E8400-E29B"

    Disbursement disbursement = Disbursement.builder()
            .status(DisbursementStatus.SUCCESS) // mocked: real system would call a payment gateway
            .transactionRef(transactionRef)
            .idempotencyKey(idempotencyKey)     // stored on the disbursement for reference
            .build();
    disbursementRepository.save(disbursement);

    // Serialize the response to JSON and log it
    String jsonPayload = objectMapper.writeValueAsString(response);
    idempotencyLogRepository.save(IdempotencyLog.builder()
            .idempotencyKey(idempotencyKey)
            .responsePayload(jsonPayload) // snapshot of the response
            .build());

    // Notify downstream
    kafkaTemplate.send("disbursement-completed", applicationId.toString(), disbursedEvent);

    return response;
}

// Called automatically when Kafka delivers an APPROVED underwriting event
public DisbursementResponse processAutomatedDisbursement(UnderwritingDecidedEvent event) {
    if (event.getStatus() != UnderwritingStatus.APPROVED) {
        throw new BusinessLogicException("Cannot disburse for non-approved application");
        // REJECTED or MANUAL_REVIEW events are silently discarded
    }

    // The idempotency key is DERIVED from business data — not random.
    // "DISB-AUTO-APP-5" is always the key for application 5.
    // This makes it deterministic across retries.
    String idempotencyKey = "DISB-AUTO-APP-" + event.getApplicationId();

    // approvedAmount might be null for auto-approved (no amount set in rules)
    BigDecimal amount = event.getApprovedAmount() != null
            ? event.getApprovedAmount()
            : BigDecimal.valueOf(10000); // fallback default

    // Dummy bank account derived from applicantId — mocks a real bank routing lookup
    String dummyBankAccount = "ACCT-" + (1000000000L + event.getApplicantId());

    return executeDisbursement(request, idempotencyKey);
}
```

---

## Service 5: `notification-service` (Port 8085)

**What it owns:** Consuming all events and creating a queryable notification log for the UI.

### `PipelineNotificationListener.java` — The Kafka Consumer

```java
@Component
public class PipelineNotificationListener {

    // @KafkaListener binds a method to a topic
    // groupId = "notification-group" → Kafka tracks this consumer's offset independently
    // from "credit-scoring-group", "underwriting-group", etc.

    @KafkaListener(topics = "loan-application-submitted", groupId = "notification-group")
    public void onApplicationSubmitted(ApplicationSubmittedEvent event) {
        // Jackson automatically deserializes the Kafka JSON bytes into ApplicationSubmittedEvent
        notificationService.sendApplicationSubmittedNotification(event);
    }

    @KafkaListener(topics = "credit-scored", groupId = "notification-group")
    public void onCreditScored(CreditScoredEvent event) { ... }

    @KafkaListener(topics = "underwriting-decided", groupId = "notification-group")
    public void onUnderwritingDecided(UnderwritingDecidedEvent event) { ... }

    @KafkaListener(topics = "disbursement-completed", groupId = "notification-group")
    public void onDisbursementCompleted(DisbursedEvent event) { ... }
}
```

> A single `@KafkaListener` creates a listener container that runs in a background thread. Spring Kafka manages the consumer group offset commit automatically after successful processing.

### `NotificationServiceImpl.java` — Event → Human-Readable Message

```java
public void sendApplicationSubmittedNotification(ApplicationSubmittedEvent event) {
    String msg = String.format(
        "Dear %s, your loan application #%d for $%s has been submitted...",
        event.getApplicantName(), event.getApplicationId(), event.getRequestedAmount()
    );
    // channel = "EMAIL", type = "APPLICATION_SUBMITTED"
    logNotification("EMAIL", event.getApplicationId(), event.getApplicantId(), "APPLICATION_SUBMITTED", "loan-application-submitted", msg);
}

public void sendCreditScoredNotification(CreditScoredEvent event) {
    String msg = String.format(
        "Credit evaluation complete for Application #%d. Score: %d (%s).",
        event.getApplicationId(), event.getCreditScore(), event.getCreditTier()
    );
    // enum.toString() → "EXCELLENT", "GOOD", etc.
    logNotification("EMAIL", ..., "CREDIT_SCORED", "credit-scored", msg);
}

public void sendDisbursementCompletedNotification(DisbursedEvent event) {
    String msg = String.format(
        "SUCCESS! Funds of $%s have been disbursed to %s. TxnRef: %s",
        event.getAmount(), event.getBankAccountNumber(), event.getTransactionRef()
    );
    logNotification("SMS", ..., "DISBURSEMENT_COMPLETED", "disbursement-completed", msg);
}

private void logNotification(String channel, Long applicationId, Long applicantId,
                              String type, String topic, String message) {
    // log.info prints to Docker container logs — visible in "docker logs" output
    log.info("📢 [NOTIFICATION SENT - {}] AppId: {} | Msg: {}", channel, applicationId, message);

    NotificationLog entry = NotificationLog.builder()
            .applicationId(applicationId)
            .eventTopic(topic)      // which Kafka topic triggered this
            .notificationType(type) // what kind of event this was
            .channel(channel)       // EMAIL / SMS / EMAIL_AND_SMS
            .message(message)       // the human-readable text
            .status("SENT")         // mocked; real impl would set FAILED on delivery error
            .build();

    repository.save(entry); // persisted to H2 — frontend polls GET /api/v1/notifications
}
```

---

## Cross-Cutting: How `@KafkaListener` Works Under the Hood

When you write:
```java
@KafkaListener(topics = "credit-scored", groupId = "underwriting-group")
public void handleCreditScored(CreditScoredEvent event) { ... }
```

Spring Kafka does this automatically at startup:
1. Creates a `KafkaConsumer` with your `groupId`.
2. Subscribes to the `credit-scored` topic.
3. Starts a background polling thread (`KafkaMessageListenerContainer`).
4. Polls Kafka for new messages since the last committed offset.
5. Deserializes the message bytes as JSON → `CreditScoredEvent` (via Jackson).
6. Calls your method.
7. On success, commits the offset back to Kafka.

If your method throws an exception, the offset is **not** committed — Kafka will redeliver that message on the next poll. This is why idempotency is critical.

---

## The Lombok Annotations Everywhere — Quick Reference

| Annotation | What It Generates |
|---|---|
| `@Data` | Getters, setters, `equals()`, `hashCode()`, `toString()` |
| `@Builder` | A builder pattern: `Foo.builder().field(val).build()` |
| `@NoArgsConstructor` | `public Foo() {}` — needed by Jackson for deserialization |
| `@AllArgsConstructor` | Constructor with all fields — needed by `@Builder` internally |
| `@RequiredArgsConstructor` | Constructor for `final` fields — Spring's constructor injection |
| `@Slf4j` | `private static final Logger log = LoggerFactory.getLogger(...)` |

> `@NoArgsConstructor` + `@AllArgsConstructor` on events is important: Jackson needs the no-arg constructor to instantiate the object, then uses setters (from `@Data`) to populate fields.
