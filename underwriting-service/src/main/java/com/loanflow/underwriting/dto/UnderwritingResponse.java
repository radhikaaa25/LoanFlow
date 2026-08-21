package com.loanflow.underwriting.dto;

import com.loanflow.common.enums.UnderwritingStatus;
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
public class UnderwritingResponse {
    private Long id;
    private Long applicationId;
    private Long applicantId;
    private Integer creditScore;
    private UnderwritingStatus status;
    private BigDecimal approvedAmount;
    private BigDecimal interestRate;
    private String decisionNotes;
    private Long underwriterId;
    private LocalDateTime createdAt;
}
