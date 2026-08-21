package com.loanflow.application.service;

import com.loanflow.application.dto.AuthResponse;
import com.loanflow.application.dto.LoginRequest;
import com.loanflow.application.dto.RegisterRequest;
import com.loanflow.application.entity.Applicant;
import com.loanflow.application.repository.ApplicantRepository;
import com.loanflow.application.security.JwtTokenProvider;
import com.loanflow.application.service.impl.AuthServiceImpl;
import com.loanflow.common.enums.UserRole;
import com.loanflow.common.exception.BusinessLogicException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private ApplicantRepository applicantRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtTokenProvider tokenProvider;

    @InjectMocks
    private AuthServiceImpl authService;

    private RegisterRequest registerRequest;
    private LoginRequest loginRequest;
    private Applicant applicant;

    @BeforeEach
    void setUp() {
        registerRequest = RegisterRequest.builder()
                .name("John Doe")
                .email("john@example.com")
                .password("password123")
                .ssn("123-45-6789")
                .monthlyIncome(BigDecimal.valueOf(8000))
                .build();

        loginRequest = LoginRequest.builder()
                .email("john@example.com")
                .password("password123")
                .build();

        applicant = Applicant.builder()
                .id(1L)
                .name("John Doe")
                .email("john@example.com")
                .passwordHash("encodedPassword")
                .ssn("123-45-6789")
                .monthlyIncome(BigDecimal.valueOf(8000))
                .role(UserRole.APPLICANT)
                .build();
    }

    @Test
    void register_ShouldRegisterUser_WhenEmailIsUnique() {
        when(applicantRepository.existsByEmail(registerRequest.getEmail())).thenReturn(false);
        when(passwordEncoder.encode(registerRequest.getPassword())).thenReturn("encodedPassword");
        when(applicantRepository.save(any(Applicant.class))).thenReturn(applicant);
        when(tokenProvider.generateToken(any(), any(), any())).thenReturn("mockJwtToken");

        AuthResponse response = authService.register(registerRequest);

        assertNotNull(response);
        assertEquals("john@example.com", response.getEmail());
        assertEquals("mockJwtToken", response.getToken());
        verify(applicantRepository, times(1)).save(any(Applicant.class));
    }

    @Test
    void register_ShouldThrowException_WhenEmailAlreadyExists() {
        when(applicantRepository.existsByEmail(registerRequest.getEmail())).thenReturn(true);

        assertThrows(BusinessLogicException.class, () -> authService.register(registerRequest));
        verify(applicantRepository, never()).save(any(Applicant.class));
    }

    @Test
    void login_ShouldReturnToken_WhenCredentialsAreValid() {
        when(applicantRepository.findByEmail(loginRequest.getEmail())).thenReturn(Optional.of(applicant));
        when(passwordEncoder.matches(loginRequest.getPassword(), applicant.getPasswordHash())).thenReturn(true);
        when(tokenProvider.generateToken(any(), any(), any())).thenReturn("mockJwtToken");

        AuthResponse response = authService.login(loginRequest);

        assertNotNull(response);
        assertEquals("mockJwtToken", response.getToken());
    }

    @Test
    void login_ShouldThrowException_WhenPasswordIsInvalid() {
        when(applicantRepository.findByEmail(loginRequest.getEmail())).thenReturn(Optional.of(applicant));
        when(passwordEncoder.matches(loginRequest.getPassword(), applicant.getPasswordHash())).thenReturn(false);

        assertThrows(BusinessLogicException.class, () -> authService.login(loginRequest));
    }
}
