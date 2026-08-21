package com.loanflow.common.event;

import com.loanflow.common.enums.CreditTier;
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
public class CreditScoredEvent {
    private Long applicationId;
    private Long applicantId;
    private Integer creditScore;
    private CreditTier creditTier;
    private BigDecimal debtToIncomeRatio;
    private Boolean isFallbackUsed;
    private LocalDateTime timestamp;
}
