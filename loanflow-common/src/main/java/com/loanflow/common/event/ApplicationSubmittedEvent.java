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
public class ApplicationSubmittedEvent {
    private Long applicationId;
    private Long applicantId;
    private String applicantName;
    private String applicantEmail;
    private String ssn;
    private BigDecimal monthlyIncome;
    private BigDecimal requestedAmount;
    private Integer loanTermMonths;
    private String kycDocumentRef;
    private LocalDateTime timestamp;
}
