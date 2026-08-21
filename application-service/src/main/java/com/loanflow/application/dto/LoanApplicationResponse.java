package com.loanflow.application.dto;

import com.loanflow.common.enums.ApplicationStatus;
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
public class LoanApplicationResponse {
    private Long id;
    private Long applicantId;
    private String applicantName;
    private String applicantEmail;
    private BigDecimal requestedAmount;
    private Integer loanTermMonths;
    private String kycDocumentRef;
    private ApplicationStatus status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
