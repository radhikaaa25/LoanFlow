-- V1__init_notification_service.sql
-- Flyway migration: create notification_logs table

CREATE TABLE notification_logs (
    id                  BIGSERIAL       PRIMARY KEY,
    application_id      BIGINT          NOT NULL,
    applicant_id        BIGINT,
    event_topic         VARCHAR(255),
    notification_type   VARCHAR(100),
    channel             VARCHAR(50),
    message             TEXT,
    status              VARCHAR(50)     NOT NULL DEFAULT 'SENT',
    created_at          TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_logs_application ON notification_logs(application_id);

