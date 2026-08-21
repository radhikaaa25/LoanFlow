package com.loanflow.disbursement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DisbursementRequest {
    @NotNull(message = "Application ID is required")
    private Long applicationId;

    @NotNull(message = "Applicant ID is required")
    private Long applicantId;

    @NotNull(message = "Amount is required")
    @Positive(message = "Amount must be positive")
    private BigDecimal amount;

    @NotBlank(message = "Bank account number is required")
    private String bankAccountNumber;
}
