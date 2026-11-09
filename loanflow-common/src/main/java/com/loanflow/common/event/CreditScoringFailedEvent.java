package com.loanflow.common.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Compensation event published when credit scoring fails entirely
 * (e.g., circuit breaker exhausted, unrecoverable error).
 * Triggers saga rollback: application-service reverts status to CREDIT_CHECK_FAILED.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditScoringFailedEvent {
    private Long applicationId;
    private Long applicantId;
    private String failureReason;
    private Boolean circuitBreakerTripped;
    private LocalDateTime timestamp;
}

