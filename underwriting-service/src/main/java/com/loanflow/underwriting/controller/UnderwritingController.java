package com.loanflow.underwriting.controller;

import com.loanflow.common.dto.ApiResponse;
import com.loanflow.underwriting.dto.ManualDecisionRequest;
import com.loanflow.underwriting.dto.UnderwritingResponse;
import com.loanflow.underwriting.service.UnderwritingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/underwriting")
@RequiredArgsConstructor
public class UnderwritingController {

    private final UnderwritingService underwritingService;

    @PostMapping("/decide")
    public ResponseEntity<ApiResponse<UnderwritingResponse>> submitManualDecision(
            @Valid @RequestBody ManualDecisionRequest request) {
        UnderwritingResponse response = underwritingService.submitManualDecision(request);
        return ResponseEntity.ok(ApiResponse.success("Manual decision submitted successfully", response));
    }

    @GetMapping("/applications/{applicationId}")
    public ResponseEntity<ApiResponse<UnderwritingResponse>> getDecisionByApplicationId(
            @PathVariable Long applicationId) {
        UnderwritingResponse response = underwritingService.getDecisionByApplicationId(applicationId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
