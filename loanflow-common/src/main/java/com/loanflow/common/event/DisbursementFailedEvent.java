package com.loanflow.common.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Compensation event published when disbursement fails.
 * Triggers saga rollback: application-service reverts status to DISBURSEMENT_FAILED,
 * notification-service alerts the applicant.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DisbursementFailedEvent {
    private Long applicationId;
    private Long applicantId;
    private String failureReason;
    private String idempotencyKey;
    private LocalDateTime timestamp;
}

