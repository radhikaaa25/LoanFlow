# LoanFlow 🏦
> **A Microservices-Based Loan Origination & Underwriting Platform**
> Built with Java 21, Spring Boot 3.3, Apache Kafka, Resilience4j, Spring Security JWT, and Docker.

---

## 📌 Overview

**LoanFlow** is a distributed backend platform modeling the end-to-end loan application lifecycle — from submission through credit evaluation, underwriting, financial disbursement, and customer notifications.

It is engineered using modern distributed system patterns:
1. **Event-Driven Architecture (Apache Kafka)** for asynchronous, decoupled service communication.
2. **Distributed Saga Pattern** to coordinate multi-stage business pipelines without single points of failure.
3. **Financial Idempotency** guaranteeing **Exactly-Once Fund Transfers** under retries and network failures.
4. **Resilience4j Circuit Breaker** preventing cascading failures when calling external credit bureau APIs.

---

## 🏗️ Architecture & Microservices Layout

```
                            ┌──────────────────┐
                            │   API Gateway /  │
                            │   REST Clients   │
                            └────────┬─────────┘
                                     │
      ┌────────────────┬─────────────┼─────────────┬────────────────┐
      ▼                ▼             ▼             ▼                ▼
┌───────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Application  │ │   Credit    │ │ Underwriting │ │ Disbursement │ │ Notification │
│    Service    │ │   Scoring   │ │   Service    │ │   Service    │ │   Service    │
│  (Port 8081)  │ │ (Port 8082) │ │ (Port 8083)  │ │ (Port 8084)  │ │ (Port 8085)  │
└───────┬───────┘ └──────┬──────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
        │                │               │                │                │
        └────────────────┴───────────────┼────────────────┴────────────────┘
                                         ▼
                               ┌──────────────────┐
                               │   Kafka Broker   │
                               │ (Event Backbone) │
                               └──────────────────┘
```

| Microservice | Port | Database | Primary Responsibility |
|---|---|---|---|
| **`application-service`** | `8081` | H2 / PostgreSQL (`applicationdb`) | Handles user JWT registration/login, submits loan applications, tracks pipeline status. Publishes `ApplicationSubmittedEvent`. |
| **`credit-scoring-service`** | `8082` | H2 / PostgreSQL (`creditdb`) | Consumes submission events, calculates credit score, wraps credit bureau calls with **Resilience4j Circuit Breaker**. Publishes `CreditScoredEvent`. |
| **`underwriting-service`** | `8083` | H2 / PostgreSQL (`underwritingdb`) | Automated rule engine (Auto-Approve, Auto-Reject, Manual Review). Publishes `UnderwritingDecidedEvent`. |
| **`disbursement-service`** | `8084` | H2 / PostgreSQL (`disbursementdb`) | Handles fund transfers using `Idempotency-Key` table to guarantee **Exactly-Once Fund Transfer**. Publishes `DisbursedEvent`. |
| **`notification-service`** | `8085` | H2 / PostgreSQL (`notificationdb`) | Listens to all pipeline events asynchronously and dispatches Email/SMS notifications. |

---


### Key Features:
1. **📝 Apply for Loan Portal**: Submit applications and watch live state transitions (`SUBMITTED` ➔ `CREDIT_CHECKED` ➔ `UNDERWRITTEN` ➔ `DISBURSED`).
2. **📊 Saga Pipeline Visualizer**: Interactive state node inspection with live JSON payload viewer for emitted Kafka events.
3. **⚖️ Underwriter Manual Review Portal**: Interface for evaluating applications flagged in score range **550–699**.
4. **💸 Idempotency Engine & Retry Simulator**: Allows demonstrating duplicate `Idempotency-Key` request rejection in real time.
5. **🔔 Live Notification Event Stream**: Stream of Email & SMS alerts dispatched by `notification-service`.

## 🔑 Core Engineering & Design Concepts

### 1. Distributed Saga Pattern (Event-Driven Pipeline)
Instead of wrapping the 5 services in a heavy 2-phase commit (2PC) database transaction, LoanFlow uses an **Event-Driven Saga**. Each service executes a local database transaction and emits an event to Kafka. Subsequent services listen and advance the loan state asynchronously.

```
[Application Submitted] ──> Kafka Topic: loan-application-submitted
                                 │
                                 ▼
                         [Credit Scoring] ──> Kafka Topic: credit-scored
                                                   │
                                                   ▼
                                           [Underwriting Decision] ──> Kafka Topic: underwriting-decided
                                                                            │
                                                                            ▼
                                                                  [Disbursement Engine] ──> Kafka Topic: disbursement-completed
```

### 2. Idempotency on Disbursement (Exactly-Once Financial Guarantee)
Financial transfer endpoints are vulnerable to retries under network timeouts. LoanFlow enforces idempotency via a unique `Idempotency-Key` header:
- When a disbursement request arrives, the service queries `idempotency_logs`.
- If key exists: returns the stored transaction response immediately **without executing a second bank transfer**.
- If key is new: executes transfer, stores the response payload, and returns result.

### 3. Circuit Breaker (Resilience4j)
The `credit-scoring-service` wraps external bureau calls using Resilience4j:
- **Closed State**: Normal operation calling external bureau.
- **Open State**: If bureau fails repeatedly, circuit opens and immediately executes `fallbackCreditEvaluation()` (assigning a conservative credit tier) without letting requests hang.

---

## ⚡ API Endpoints Quick Reference

### 1. Application Service (`http://localhost:8081`)
- `POST /api/v1/auth/register` — Register new applicant
- `POST /api/v1/auth/login` — Login and obtain JWT token
- `POST /api/v1/applications` — Submit loan application *(Requires Bearer JWT)*
- `GET /api/v1/applications/{id}` — Get application details & status
- `GET /api/v1/applications/me` — Get current applicant's applications

### 2. Underwriting Service (`http://localhost:8083`)
- `POST /api/v1/underwriting/decide` — Underwriter manual decision portal
- `GET /api/v1/underwriting/applications/{applicationId}` — Retrieve decision details

### 3. Disbursement Service (`http://localhost:8084`)
- `POST /api/v1/disbursements` — Execute fund transfer *(Requires `Idempotency-Key` header)*
- `GET /api/v1/disbursements/applications/{applicationId}` — Retrieve disbursement record

### 4. Notification Service (`http://localhost:8085`)
- `GET /api/v1/notifications/applications/{applicationId}` — View all notifications generated across saga pipeline

---

## 🧪 Running Tests & Building Project

### Compile and Run Tests Across All Microservices:
```bash
mvn clean test
```

### Build Executable JARS:
```bash
mvn clean package -DskipTests
```

---


