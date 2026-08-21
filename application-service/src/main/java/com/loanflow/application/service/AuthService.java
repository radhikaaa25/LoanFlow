package com.loanflow.application.service;

import com.loanflow.application.dto.AuthResponse;
import com.loanflow.application.dto.LoginRequest;
import com.loanflow.application.dto.RegisterRequest;

public interface AuthService {
    AuthResponse register(RegisterRequest request);
    AuthResponse login(LoginRequest request);
}
