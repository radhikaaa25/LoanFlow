-- V1__init_credit_scoring_service.sql
-- Flyway migration: create credit_reports table

CREATE TABLE credit_reports (
    id                      BIGSERIAL       PRIMARY KEY,
    applicant_id            BIGINT          NOT NULL,
    application_id          BIGINT          NOT NULL,
    credit_score            INT,
    credit_tier             VARCHAR(50),
    debt_to_income_ratio    DECIMAL(10,4),
    is_fallback_used        BOOLEAN         DEFAULT FALSE,
    created_at              TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_reports_application ON credit_reports(application_id);

