package com.loanflow.application.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RegisterRequest {
    @NotBlank(message = "Name is required")
    private String name;

    @Email(message = "Invalid email format")
    @NotBlank(message = "Email is required")
    private String email;

    @NotBlank(message = "Password is required")
    private String password;

    // Required only for USER (applicants); optional for ADMIN
    private String ssn;

    // Required only for USER (applicants); optional for ADMIN
    private BigDecimal monthlyIncome;

    /**
     * Optional role field. If "ADMIN" is passed, the user gets admin privileges.
     * Defaults to USER if omitted.
     */
    private String role;
}
