package com.loanflow.application.service.impl;

import com.loanflow.application.dto.AuthResponse;
import com.loanflow.application.dto.LoginRequest;
import com.loanflow.application.dto.RegisterRequest;
import com.loanflow.application.entity.Applicant;
import com.loanflow.application.repository.ApplicantRepository;
import com.loanflow.application.security.JwtTokenProvider;
import com.loanflow.application.service.AuthService;
import com.loanflow.common.enums.UserRole;
import com.loanflow.common.exception.BusinessLogicException;
import com.loanflow.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final ApplicantRepository applicantRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    @Override
    public AuthResponse register(RegisterRequest request) {
        if (applicantRepository.existsByEmail(request.getEmail())) {
            throw new BusinessLogicException("Email address already registered");
        }

        // Determine role: default to USER, allow ADMIN if explicitly requested
        UserRole role = UserRole.USER;
        if (request.getRole() != null && request.getRole().equalsIgnoreCase("ADMIN")) {
            role = UserRole.ADMIN;
        }

        // SSN and monthlyIncome are required for applicants (USER), optional for ADMIN
        if (role == UserRole.USER) {
            if (request.getSsn() == null || request.getSsn().isBlank()) {
                throw new BusinessLogicException("SSN is required for applicant registration");
            }
            if (request.getMonthlyIncome() == null || request.getMonthlyIncome().signum() <= 0) {
                throw new BusinessLogicException("Monthly income must be positive for applicant registration");
            }
        }

        Applicant applicant = Applicant.builder()
                .name(request.getName())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .ssn(role == UserRole.ADMIN ? null : request.getSsn())
                .monthlyIncome(role == UserRole.ADMIN ? null : request.getMonthlyIncome())
                .role(role)
                .build();

        Applicant savedApplicant = applicantRepository.save(applicant);
        String token = tokenProvider.generateToken(
                savedApplicant.getEmail(),
                savedApplicant.getId(),
                savedApplicant.getRole().name());

        return AuthResponse.builder()
                .token(token)
                .applicantId(savedApplicant.getId())
                .name(savedApplicant.getName())
                .email(savedApplicant.getEmail())
                .ssn(savedApplicant.getSsn())
                .monthlyIncome(savedApplicant.getMonthlyIncome())
                .role(savedApplicant.getRole())
                .build();
    }

    @Override
    public AuthResponse login(LoginRequest request) {
        Applicant applicant = applicantRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessLogicException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), applicant.getPasswordHash())) {
            throw new BusinessLogicException("Invalid email or password");
        }

        String token = tokenProvider.generateToken(
                applicant.getEmail(),
                applicant.getId(),
                applicant.getRole().name());

        return AuthResponse.builder()
                .token(token)
                .applicantId(applicant.getId())
                .name(applicant.getName())
                .email(applicant.getEmail())
                .ssn(applicant.getSsn())
                .monthlyIncome(applicant.getMonthlyIncome())
                .role(applicant.getRole())
                .build();
    }

    @Override
    public AuthResponse getCurrentUser(String email) {
        Applicant applicant = applicantRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with email: " + email));

        return AuthResponse.builder()
                .applicantId(applicant.getId())
                .name(applicant.getName())
                .email(applicant.getEmail())
                .ssn(applicant.getSsn())
                .monthlyIncome(applicant.getMonthlyIncome())
                .role(applicant.getRole())
                .build();
    }
}
