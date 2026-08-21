package com.loanflow.underwriting.dto;

import com.loanflow.common.enums.UnderwritingStatus;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ManualDecisionRequest {
    @NotNull(message = "Application ID is required")
    private Long applicationId;

    @NotNull(message = "Status is required")
    private UnderwritingStatus status;

    private BigDecimal approvedAmount;
    private BigDecimal interestRate;
    private String decisionNotes;
    private Long underwriterId;
}
