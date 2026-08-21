package com.loanflow.common.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DisbursedEvent {
    private Long disbursementId;
    private Long applicationId;
    private Long applicantId;
    private BigDecimal amount;
    private String bankAccountNumber;
    private String transactionRef;
    private String idempotencyKey;
    private LocalDateTime timestamp;
}
