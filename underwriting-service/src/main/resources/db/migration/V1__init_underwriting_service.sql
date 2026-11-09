-- V1__init_underwriting_service.sql
-- Flyway migration: create underwriting_decisions table

CREATE TABLE underwriting_decisions (
    id              BIGSERIAL       PRIMARY KEY,
    application_id  BIGINT          NOT NULL UNIQUE,
    applicant_id    BIGINT          NOT NULL,
    credit_score    INT,
    status          VARCHAR(50)     NOT NULL,
    approved_amount DECIMAL(19,2),
    interest_rate   DECIMAL(10,4),
    decision_notes  TEXT,
    underwriter_id  BIGINT,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_underwriting_application ON underwriting_decisions(application_id);

