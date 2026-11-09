package com.loanflow.application.controller;

import com.loanflow.application.dto.LoanApplicationRequest;
import com.loanflow.application.dto.LoanApplicationResponse;
import com.loanflow.application.service.LoanApplicationService;
import com.loanflow.common.dto.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/applications")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class LoanApplicationController {

    private final LoanApplicationService applicationService;

    /**
     * ADMIN only: view ALL applications across all users.
     */
    @GetMapping("/all")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<LoanApplicationResponse>>> getAllApplications() {
        List<LoanApplicationResponse> responses = applicationService.getAllApplications();
        return ResponseEntity.ok(ApiResponse.success(responses));
    }

    /**
     * Both USER and ADMIN: submit a new loan application.
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('USER', 'ADMIN')")
    public ResponseEntity<ApiResponse<LoanApplicationResponse>> submitApplication(
            @Valid @RequestBody LoanApplicationRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        LoanApplicationResponse response = applicationService.submitApplication(request, userDetails.getUsername());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Loan application submitted successfully", response));
    }

    /**
     * Both USER and ADMIN: view a specific application by ID.
     * (Users can only see their own — enforced in service layer.)
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN')")
    public ResponseEntity<ApiResponse<LoanApplicationResponse>> getApplicationById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        LoanApplicationResponse response = applicationService.getApplicationById(id, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Both USER and ADMIN: view the current user's own applications.
     */
    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<LoanApplicationResponse>>> getMyApplications(
            @AuthenticationPrincipal UserDetails userDetails) {
        List<LoanApplicationResponse> responses = applicationService.getApplicantApplications(userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success(responses));
    }
}
