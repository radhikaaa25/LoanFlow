-- V1__init_application_service.sql
-- Flyway migration: create applicants and loan_applications tables

CREATE TABLE applicants (
    id              BIGSERIAL       PRIMARY KEY,
    name            VARCHAR(255)    NOT NULL,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,
    ssn             VARCHAR(20),
    monthly_income  DECIMAL(19,2),
    role            VARCHAR(50)     NOT NULL DEFAULT 'APPLICANT',
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE TABLE loan_applications (
    id                  BIGSERIAL       PRIMARY KEY,
    applicant_id        BIGINT          NOT NULL REFERENCES applicants(id),
    requested_amount    DECIMAL(19,2)   NOT NULL,
    loan_term_months    INT             NOT NULL,
    kyc_document_ref    VARCHAR(500),
    status              VARCHAR(50)     NOT NULL DEFAULT 'SUBMITTED',
    created_at          TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP
);

CREATE INDEX idx_loan_applications_applicant ON loan_applications(applicant_id);
CREATE INDEX idx_loan_applications_status ON loan_applications(status);

