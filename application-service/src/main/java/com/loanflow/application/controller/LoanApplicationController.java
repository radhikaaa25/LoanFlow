package com.loanflow.application.controller;

import com.loanflow.application.dto.LoanApplicationRequest;
import com.loanflow.application.dto.LoanApplicationResponse;
import com.loanflow.application.service.LoanApplicationService;
import com.loanflow.common.dto.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/applications")
@RequiredArgsConstructor
public class LoanApplicationController {

    private final LoanApplicationService applicationService;

    @PostMapping
    public ResponseEntity<ApiResponse<LoanApplicationResponse>> submitApplication(
            @Valid @RequestBody LoanApplicationRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        LoanApplicationResponse response = applicationService.submitApplication(request, userDetails.getUsername());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Loan application submitted successfully", response));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<LoanApplicationResponse>> getApplicationById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        LoanApplicationResponse response = applicationService.getApplicationById(id, userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<List<LoanApplicationResponse>>> getMyApplications(
            @AuthenticationPrincipal UserDetails userDetails) {
        List<LoanApplicationResponse> responses = applicationService.getApplicantApplications(userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success(responses));
    }
}
