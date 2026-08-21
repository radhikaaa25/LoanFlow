package com.loanflow.application.dto;

import com.loanflow.common.enums.UserRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthResponse {
    private String token;
    private Long applicantId;
    private String name;
    private String email;
    private UserRole role;
}
