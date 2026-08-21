package com.loanflow.disbursement.dto;

import com.loanflow.common.enums.DisbursementStatus;
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
public class DisbursementResponse {
    private Long id;
    private Long applicationId;
    private Long applicantId;
    private BigDecimal amount;
    private String bankAccountNumber;
    private String transactionRef;
    private String idempotencyKey;
    private DisbursementStatus status;
    private LocalDateTime createdAt;
    @Builder.Default
    private Boolean isDuplicateRequest = false;
}
