-- V1__init_disbursement_service.sql
-- Flyway migration: create disbursements and idempotency_logs tables

CREATE TABLE disbursements (
    id                  BIGSERIAL       PRIMARY KEY,
    application_id      BIGINT          NOT NULL,
    applicant_id        BIGINT          NOT NULL,
    amount              DECIMAL(19,2)   NOT NULL,
    bank_account_number VARCHAR(100),
    transaction_ref     VARCHAR(255)    UNIQUE,
    idempotency_key     VARCHAR(255)    UNIQUE,
    status              VARCHAR(50)     NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE TABLE idempotency_logs (
    id              BIGSERIAL       PRIMARY KEY,
    idempotency_key VARCHAR(255)    NOT NULL UNIQUE,
    response_payload TEXT,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disbursements_application ON disbursements(application_id);
CREATE INDEX idx_disbursements_idempotency ON disbursements(idempotency_key);
CREATE INDEX idx_idempotency_logs_key ON idempotency_logs(idempotency_key);

