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

        Applicant applicant = Applicant.builder()
                .name(request.getName())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .ssn(request.getSsn())
                .monthlyIncome(request.getMonthlyIncome())
                .role(UserRole.APPLICANT)
                .build();

        Applicant savedApplicant = applicantRepository.save(applicant);
        String token = tokenProvider.generateToken(
                savedApplicant.getEmail(),
                savedApplicant.getId(),
                savedApplicant.getRole().name()
        );

        return AuthResponse.builder()
                .token(token)
                .applicantId(savedApplicant.getId())
                .name(savedApplicant.getName())
                .email(savedApplicant.getEmail())
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
                applicant.getRole().name()
        );

        return AuthResponse.builder()
                .token(token)
                .applicantId(applicant.getId())
                .name(applicant.getName())
                .email(applicant.getEmail())
                .role(applicant.getRole())
                .build();
    }
}
