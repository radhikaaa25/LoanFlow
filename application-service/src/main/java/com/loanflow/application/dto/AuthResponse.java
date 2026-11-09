package com.loanflow.application.dto;

import com.loanflow.common.enums.UserRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthResponse {
    private String token;
    private Long applicantId;
    private String name;
    private String email;
    private String ssn;
    private BigDecimal monthlyIncome;
    private UserRole role;
}
