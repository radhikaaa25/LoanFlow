# LoanFlow — System Design Concepts, Decisions & Tradeoffs

Every concept used in this system was chosen to solve a *specific, real problem*. This document explains what that problem is, what we chose, what we rejected, and exactly where in the code it appears.

---

## 1. Microservices Architecture

### The Problem It Solves
Imagine LoanFlow as one giant Spring Boot app. A credit bureau API call hangs → the **entire system** is unresponsive. A bug in disbursement logic → you redeploy the whole application and loan intake goes down too. You can't scale just the "credit scoring" part independently.

### The Decision
Split the system into **5 independent deployable units**, each owning its own:
- Business domain
- Database (H2 per service — no shared DB)
- Deployment lifecycle

### What We Rejected
**The Monolith.** It's simpler to build, but it's a single point of failure. At scale, one slow component blocks everything. You can't deploy independently, and the codebase becomes unmanageable.

### Where It Appears in LoanFlow
```
docker-compose.yml → 5 separate container builds
application-service:8081   → auth + intake domain
credit-scoring-service:8082 → risk assessment domain
underwriting-service:8083  → decision domain
disbursement-service:8084  → payments domain
notification-service:8085  → comms domain
```
Each has its own `Dockerfile`, its own Spring Boot `application.yml`, its own H2 database. None of them share a database.

### The Tradeoff You Accept
- **Distributed debugging** — a request spans 5 processes. Logs are spread across 5 containers.
- **Operational overhead** — you need Kafka, ZooKeeper, AND all 5 services running.
- **Eventual consistency** — you can't do a `SELECT ... JOIN` across service databases.

---

## 2. Event-Driven Architecture (EDA)

### The Problem It Solves
If services called each other via REST (HTTP), you'd have **tight temporal coupling**: credit-scoring must be running when application-service calls it, or the request fails. If credit-scoring goes down for 30 minutes, all loan submissions during that window fail permanently.

### The Decision
Services communicate **only through Kafka events**. The producer fires an event and immediately returns. The consumer picks it up whenever it's ready — even if it was down for 30 minutes and is just restarting.

### What We Rejected
**Synchronous REST chaining** (application → credit → underwriting → disbursement via HTTP). 

Problems:
- Cascading failures: one service down = entire chain down
- Tight coupling: you must know every downstream service's URL
- Hard to add new consumers: adding a "fraud detection" service means modifying application-service to call it

### Where It Appears in LoanFlow
```java
// application-service fires and forgets
kafkaTemplate.send("loan-application-submitted", applicationId.toString(), event);
return mapToResponse(saved); // ← returns to frontend IMMEDIATELY, not after scoring

// credit-scoring-service picks it up independently
@KafkaListener(topics = "loan-application-submitted", groupId = "credit-scoring-group")
public void handleSubmittedApplication(ApplicationSubmittedEvent event) { ... }
```

### The Tradeoff You Accept
- **Eventual consistency** — the frontend doesn't know the score the instant the loan is submitted. It has to poll.
- **Message ordering complexity** — you need partition keys to guarantee order.
- **Debugging** — you can't put a breakpoint across service boundaries.

---

## 3. The Saga Pattern (Choreography-Based)

### The Problem It Solves
In a monolith, a multi-step operation is wrapped in one database transaction: if step 3 fails, the DB rolls back steps 1 and 2 automatically. In microservices, each service has its own DB — **there is no global transaction**. If disbursement fails after underwriting succeeds, you have inconsistent state.

### The Decision
Use the **Saga pattern**: each service performs its local transaction, then publishes an event. If a step fails, a **compensating event** is published to undo prior steps.

Two variants exist:
- **Choreography** (what LoanFlow uses): each service reacts to events independently, no central coordinator
- **Orchestration**: a dedicated "Saga Orchestrator" service explicitly calls each step and tracks state

LoanFlow uses **Choreography** — simpler for our pipeline because it's linear (A→B→C→D with no branching dependencies).

### Where It Appears in LoanFlow
```
Saga Step 1: application-service   → saves LoanApplication → emits ApplicationSubmittedEvent
Saga Step 2: credit-scoring-service → saves CreditReport    → emits CreditScoredEvent
Saga Step 3: underwriting-service  → saves UnderwritingDecision → emits UnderwritingDecidedEvent
Saga Step 4: disbursement-service  → saves Disbursement    → emits DisbursedEvent
```

The implicit **compensating logic**:
```java
// underwriting-service: if rejected, it publishes an event with status=REJECTED
// disbursement-service reads it and throws immediately:
if (event.getStatus() != UnderwritingStatus.APPROVED) {
    throw new BusinessLogicException("Cannot disburse for non-approved application");
}
// No money moves. The saga "rolls back" by not proceeding.
```

### Why Choreography over Orchestration?
For a **linear** pipeline (A always goes to B, B always goes to C), choreography is sufficient. Orchestration adds complexity of a central state machine — worth it only when steps have complex branching or parallel paths.

### The Tradeoff You Accept
- **No automatic global rollback** — you must design compensating events manually
- **Hard to see the whole saga state** — it's distributed across 5 DB tables
- Choreography gets confusing if the flow branches (e.g., "if score > 700 AND income > 50k, skip underwriting")

---

## 4. Idempotency

### The Problem It Solves
Kafka guarantees **at-least-once delivery** — under failure scenarios (network partition, consumer crash mid-processing), a message can be delivered more than once. Without protection, a consumer might disburse the same loan twice.

```
Timeline of a double-delivery:
1. Kafka delivers UnderwritingDecidedEvent to disbursement-service
2. disbursement-service processes it, funds the loan
3. disbursement-service crashes before committing the Kafka offset
4. On restart, Kafka redelivers the same event (offset wasn't committed)
5. WITHOUT idempotency: loan funded AGAIN ← catastrophic
6. WITH idempotency: second call hits the key check, returns cached response safely
```

### The Decision
Use an **idempotency key**: a unique string derived from business data. Before doing any work, look it up. If found, return the cached result.

Key design choices:
1. Key must be **deterministic** — not random. `"DISB-AUTO-APP-5"` will always be the key for application 5, even on retry.
2. Cache the **full response** as JSON, not just a flag — so you return the exact same response to the caller.
3. Use a **DB-level UNIQUE constraint** as the real safety net for concurrent requests.

### Where It Appears in LoanFlow
```java
// DisbursementServiceImpl.java

// Key derived from business identity — same application always = same key
String idempotencyKey = "DISB-AUTO-APP-" + event.getApplicationId();

// Check FIRST — before any DB write or money movement
Optional<IdempotencyLog> existingLog = idempotencyLogRepository.findByIdempotencyKey(idempotencyKey);
if (existingLog.isPresent()) {
    DisbursementResponse cached = objectMapper.readValue(
        existingLog.get().getResponsePayload(), DisbursementResponse.class
    );
    cached.setIsDuplicateRequest(true); // transparent to the caller
    return cached; // ← exits here, nothing else happens
}

// Only reaches here on FIRST execution
// ... do actual work ...

// Save the response JSON as the idempotency record
idempotencyLogRepository.save(IdempotencyLog.builder()
    .idempotencyKey(idempotencyKey)
    .responsePayload(objectMapper.writeValueAsString(response))
    .build());
```

```java
// IdempotencyLog.java — the DB-level guard
@Table(indexes = {
    @Index(columnList = "idempotency_key", unique = true) // ← real concurrent safety
})
```

### What We Rejected
**Using a simple boolean flag** (`isDisbursed` on the application). Problems: flag must be checked and set atomically (race condition), doesn't cache the response, and doesn't work across service restarts.

### The Tradeoff You Accept
- Extra DB table and write on every disbursement
- The idempotency log can grow large and needs periodic cleanup in production

---

## 5. Circuit Breaker

### The Problem It Solves
The credit-scoring-service calls an external credit bureau API. What happens if the bureau is down for 10 minutes?
- Without a circuit breaker: every loan application hangs waiting for a timeout, threads pile up, service runs out of resources, **entire service crashes**.
- With a circuit breaker: after a threshold of failures, the circuit "opens" and calls are **fast-failed** with a fallback — no more waiting, resources are preserved.

### The States of a Circuit Breaker
```
CLOSED (normal) → failures accumulate → threshold hit
    ↓
OPEN (fast-fail mode) → all calls go to fallback immediately
    ↓ after timeout
HALF-OPEN (probe mode) → one call allowed through
    ↓ success          ↓ failure
CLOSED again         OPEN again
```

### The Decision
Use **Resilience4j** (the modern Spring Boot circuit breaker library) with a fallback method.

The fallback strategy in LoanFlow: assign `score=600, tier=FAIR`. This:
1. Keeps the pipeline moving (no blocking)
2. Puts the case in the "manual review" zone (underwriting will flag it — a human will review)
3. Sets `isFallbackUsed=true` so the flag is visible in audit logs

### Where It Appears in LoanFlow
```java
// CreditScoringServiceImpl.java
@CircuitBreaker(name = "creditBureauService", fallbackMethod = "fallbackCreditEvaluation")
public CreditScoredEvent processCreditEvaluation(ApplicationSubmittedEvent event) {
    // This line can throw if bureau is unavailable
    int score = bureauClient.fetchScoreFromBureau(event.getSsn());
    // ...
}

// Resilience4j calls this automatically when the circuit opens
public CreditScoredEvent fallbackCreditEvaluation(ApplicationSubmittedEvent event, Throwable t) {
    // t = the root exception (e.g., "503 Connection Timeout")
    int fallbackScore = 600; // conservative but not catastrophic
    // isFallbackUsed = true → underwriter knows to verify manually
}

// ExternalCreditBureauClientImpl.java — test trigger
if (ssn != null && ssn.endsWith("9999")) {
    throw new RuntimeException("External Credit Bureau API Connection Timeout (503)");
    // Submit a loan with SSN "123-45-9999" to see the circuit breaker fire
}
```

### What We Rejected
**No fallback (propagate the exception)**. This would cause the Kafka consumer to fail without committing the offset. Kafka redelivers the message. The bureau is still down. This loops forever — a message storm. The application is stuck indefinitely.

### The Tradeoff You Accept
- Fallback scores are approximations — a manual reviewer must validate
- Circuit breaker thresholds require tuning (how many failures before opening?)

---

## 6. Stateless Authentication with JWT

### The Problem It Solves
Traditional session-based auth: the server stores session state in memory. In a distributed system with multiple instances of a service, instance A might authenticate you but instance B has no record of your session — you'd be rejected.

### The Decision
**JSON Web Tokens (JWT)**: the token itself carries all the identity information, cryptographically signed. The server doesn't store anything. Any instance can verify any token using just the secret key.

```
JWT structure:
eyJhbGciOiJIUzI1NiJ9  ← Header (algorithm)
.eyJzdWIiOiJ1c2VyQGV4YW1wbGUuY29tIiwiYXBwbGljYW50SWQiOjEsInJvbGUiOiJBUFBMSUNBTlQifQ==
                       ← Payload (email, applicantId, role, expiry)
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
                       ← Signature (HMAC-SHA256 of header+payload using secret)
```

If anyone tampers with the payload (e.g., changes their role to ADMIN), the signature won't match — rejected.

### Where It Appears in LoanFlow
```java
// JwtTokenProvider.java — token creation
Jwts.builder()
    .subject(email)                    // WHO this token is for
    .claim("applicantId", applicantId) // extra data embedded in token
    .claim("role", role)
    .expiration(new Date(now + 86400000)) // expires in 24 hours
    .signWith(Keys.hmacShaKeyFor(secretKey)) // HMAC-SHA256 signature
    .compact();

// JwtAuthenticationFilter.java — token verification on every request
String token = bearerToken.substring(7); // strips "Bearer " prefix
if (tokenProvider.validateToken(token)) {   // verify signature + expiry
    String email = tokenProvider.getEmailFromToken(token); // extract "sub" claim
    SecurityContextHolder.getContext().setAuthentication(authentication);
    // now @AuthenticationPrincipal UserDetails works in any controller
}

// SecurityConfig.java — enforce statelessness
.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
// Spring will NEVER create an HTTP session — every request must carry its JWT
```

### What We Rejected
**HTTP Sessions (server-side state)**. They don't work when you scale horizontally (multiple instances) without sticky sessions or a shared session store (Redis). JWT eliminates this dependency entirely.

### The Tradeoff You Accept
- **Tokens can't be invalidated before expiry** — if a user's token is stolen, it's valid for 24 hours. In production, you'd use short-lived tokens (15 min) + refresh tokens.
- **Payload size** — JWT travels in every HTTP header, slightly increasing bandwidth.

---

## 7. Consumer Groups & Fan-Out

### The Problem It Solves
Two things need to happen when a `CreditScoredEvent` is published:
1. `underwriting-service` must process it for a decision
2. `notification-service` must log it for the UI

If both services were in the **same consumer group**, Kafka would deliver the message to only ONE of them (load balancing). You'd lose the other.

### The Decision
Give each service a **unique consumer group ID**. Kafka maintains a separate offset pointer per group — every group gets every message independently.

```
Topic: "credit-scored"
  ├── Consumer Group "underwriting-group"  → underwriting-service reads it
  └── Consumer Group "notification-group" → notification-service reads it
  
Both get the SAME message. Neither knows the other exists.
```

This is **fan-out** — one event, multiple independent consumers.

### Where It Appears in LoanFlow
```java
// credit-scoring-service: Kafka consumer for the first topic
@KafkaListener(topics = "loan-application-submitted", groupId = "credit-scoring-group")

// underwriting-service: its own group
@KafkaListener(topics = "credit-scored", groupId = "underwriting-group")

// notification-service: listens to ALL 4 topics with ONE group
@KafkaListener(topics = "loan-application-submitted", groupId = "notification-group")
@KafkaListener(topics = "credit-scored",              groupId = "notification-group")
@KafkaListener(topics = "underwriting-decided",       groupId = "notification-group")
@KafkaListener(topics = "disbursement-completed",     groupId = "notification-group")
```

### The Tradeoff You Accept
- Each consumer group independently tracks offsets — if notification-service crashes and misses 1000 events, it replays all 1000 when it restarts (messages aren't lost, just delayed).

---

## 8. Message Ordering via Partition Keys

### The Problem It Solves
Kafka can deliver messages out of order across partitions. Consider:
- `CreditScoredEvent` for loan #5 lands on Partition 1
- `UnderwritingDecidedEvent` for loan #5 lands on Partition 2

If two consumers process these in parallel, `disbursement-service` might process the underwriting decision before `credit-scoring-service` even published it — causing a "record not found" error.

### The Decision
Use **the `applicationId` as the Kafka message key**. Kafka guarantees:
> All messages with the same key go to the same partition, in the order they were produced.

So all events for loan #5 always land on the same partition, always processed in order.

### Where It Appears in LoanFlow
```java
// application-service — key = applicationId
kafkaTemplate.send("loan-application-submitted", saved.getId().toString(), event);
//                                                ^^^^^^^^^^^^^^^^^^^^ partition key

// credit-scoring-service — same key passed through
kafkaTemplate.send("credit-scored", scoredEvent.getApplicationId().toString(), scoredEvent);

// underwriting-service — same key
kafkaTemplate.send("underwriting-decided", decision.getApplicationId().toString(), event);

// disbursement-service — same key
kafkaTemplate.send("disbursement-completed", savedDisbursement.getApplicationId().toString(), event);
```

Every hop in the pipeline uses `applicationId` as the partition key → the entire saga for one loan flows through the same partition → guaranteed ordering.

### The Tradeoff You Accept
- If one partition is "hot" (all loan #s hash to the same partition), you can't parallelize. In practice, random `applicationId` distribution spreads load naturally.

---

## 9. Shared Contract Module (`loanflow-common`)

### The Problem It Solves
`credit-scoring-service` publishes a `CreditScoredEvent` as JSON. `underwriting-service` consumes it. If the class definitions are different (even a mismatched field name), Jackson throws a deserialization exception and the message is lost.

### The Decision
Create a shared Maven module that all services import as a dependency. The event POJOs, enums, and exception types live here — **one source of truth**.

### Where It Appears in LoanFlow
```
loanflow-common/
  └── src/main/java/com/loanflow/common/
      ├── event/
      │   ├── ApplicationSubmittedEvent.java  ← imported by app-svc (producer) + credit-svc (consumer)
      │   ├── CreditScoredEvent.java          ← imported by credit-svc (producer) + underwriting-svc
      │   ├── UnderwritingDecidedEvent.java   ← imported by underwriting-svc + disbursement-svc
      │   └── DisbursedEvent.java             ← imported by disbursement-svc + notification-svc
      ├── enums/
      │   ├── CreditTier.java      (EXCELLENT, GOOD, FAIR, POOR)
      │   ├── UnderwritingStatus.java (APPROVED, REJECTED, FLAGGED_FOR_MANUAL_REVIEW)
      │   └── ApplicationStatus.java
      └── dto/
          └── ApiResponse.java    ← standard response wrapper used by all controllers
```

### What We Rejected
**Duplicating the event classes in each service.** The moment you change a field in the producer's copy but forget to update the consumer's copy, you get silent data corruption. The shared module makes schema changes fail at **compile time** instead of runtime.

### The Tradeoff You Accept
- All services are now coupled to the `loanflow-common` version. A breaking change to an event requires redeployment of all affected services simultaneously.
- In large organizations, this is managed with a **schema registry** (like Confluent Schema Registry with Avro) instead of a shared JAR.

---

## 10. Eventual Consistency

### The Problem It Solves
This isn't a problem we solved — it's a **consequence** we accepted in exchange for the benefits of decoupled async processing.

### What It Means
After submitting a loan, the credit score is NOT available in the response. The response only confirms the application was saved. The score, underwriting decision, and disbursement result each appear **eventually** — after the async pipeline completes.

```
User submits loan → application-service returns 201 (immediately)
... 100ms later ...
credit-scoring-service scores it → saves CreditReport → publishes event
... 200ms later ...
underwriting-service decides → saves UnderwritingDecision → publishes event
... 300ms later ...
disbursement-service funds → saves Disbursement → publishes event
```

### How LoanFlow Handles It
The frontend **polls** `notification-service` every few seconds. notification-service has been consuming all these events and storing them. The UI shows the growing pipeline trace as records appear.

### The Tradeoff
- **Better**: availability, decoupling, resilience, independent scaling
- **Worse**: UI complexity (polling/SSE), harder to show real-time state, users need to refresh

---

## 11. Layered Architecture (Controller → Service → Repository)

### The Problem It Solves
If you put SQL queries in your controller and business logic in your entity, the code becomes impossible to test, reuse, or change.

### The Decision
Enforce three strict layers:

| Layer | Responsibility | Knows About |
|---|---|---|
| **Controller** | HTTP input/output, routing, param extraction | DTOs, Service interface |
| **Service** | ALL business logic, orchestration, Kafka publishing | Repository, KafkaTemplate |
| **Repository** | DB access only, no logic | Entity, Spring Data JPA |

### Where It Appears in LoanFlow
```java
// Controller — ONLY handles HTTP concerns
@PostMapping
public ResponseEntity<ApiResponse<LoanApplicationResponse>> submitApplication(
        @Valid @RequestBody LoanApplicationRequest request,  // ← parse HTTP body
        @AuthenticationPrincipal UserDetails userDetails) {  // ← extract identity
    LoanApplicationResponse response = applicationService.submitApplication(...);
    return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
}

// Service — ALL the logic (Kafka, DB orchestration, validation)
@Transactional
public LoanApplicationResponse submitApplication(request, email) {
    Applicant applicant = applicantRepository.findByEmail(email).orElseThrow();
    applicant.setSsn(request.getSsn());
    applicantRepository.save(applicant);
    // ... build event, publish to Kafka, etc.
}

// Repository — no code required for standard queries
public interface ApplicantRepository extends JpaRepository<Applicant, Long> {
    Optional<Applicant> findByEmail(String email); // Spring Data generates the SQL
}
```

> Notice: **`CreditScoringController`** directly injects `CreditReportRepository` — skipping the Service layer. This is acceptable for simple read-only query endpoints but is a shortcut. In production, a `CreditScoringService` interface would sit between them for testability.

---

## 12. Database-per-Service

### The Problem It Solves
If all services share one database, a schema change in one service can break others. Services are coupled at the database level. You can't independently scale or deploy them.

### The Decision
Each service has its own H2 in-memory database — completely isolated. No service can query another service's tables directly. The only way to get data from another service is via its API or via Kafka events.

### Where It Appears in LoanFlow
Each service has its own `application.yml`:
```yaml
# application-service
spring.datasource.url: jdbc:h2:mem:applicationdb

# credit-scoring-service
spring.datasource.url: jdbc:h2:mem:creditdb

# underwriting-service
spring.datasource.url: jdbc:h2:mem:underwritingdb

# disbursement-service
spring.datasource.url: jdbc:h2:mem:disbursementdb

# notification-service
spring.datasource.url: jdbc:h2:mem:notificationdb
```

Completely separate databases. `credit-scoring-service` cannot do `SELECT * FROM loan_applications` — that table doesn't exist in its DB.

### The Tradeoff You Accept
- **No cross-service JOINs** — you can't write `SELECT a.*, c.* FROM loan_applications a JOIN credit_reports c ON a.id = c.application_id` across services.
- The frontend must call multiple service endpoints and join data in JavaScript.

---

## Summary Table

| Concept | Problem Solved | Where in Code | Tradeoff |
|---|---|---|---|
| **Microservices** | Single point of failure, independent scaling | 5 Docker containers | Operational complexity |
| **Event-Driven / Kafka** | Temporal coupling, cascading failures | `kafkaTemplate.send(...)` everywhere | Eventual consistency |
| **Choreography Saga** | Distributed transactions without 2PC | 4 events chained across services | No automatic rollback |
| **Idempotency** | Kafka at-least-once → duplicate processing | `IdempotencyLog` + DB unique index | Extra storage, cleanup needed |
| **Circuit Breaker** | External API failure cascading inward | `@CircuitBreaker` on bureau call | Fallback scores need human review |
| **JWT (Stateless Auth)** | Session state doesn't work at scale | `JwtTokenProvider`, `JwtAuthFilter` | Can't revoke before expiry |
| **Consumer Groups** | Fan-out (one event → multiple consumers) | Different `groupId` per service | Each group tracks its own offset |
| **Partition Keys** | Message ordering within a topic | `applicationId.toString()` as key | Hot partition risk |
| **Shared Contract Module** | Schema drift between producer/consumer | `loanflow-common` Maven module | Coupling on version change |
| **Eventual Consistency** | (Accepted consequence of EDA) | Frontend polls notification-service | UI complexity, not immediate |
| **Layered Architecture** | Testability, separation of concerns | Controller → Service → Repository | Boilerplate |
| **DB-per-Service** | Schema independence, service isolation | Separate H2 DB per service | No cross-service SQL joins |
