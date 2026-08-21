package com.loanflow.disbursement.controller;

import com.loanflow.common.dto.ApiResponse;
import com.loanflow.disbursement.dto.DisbursementRequest;
import com.loanflow.disbursement.dto.DisbursementResponse;
import com.loanflow.disbursement.service.DisbursementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/disbursements")
@RequiredArgsConstructor
public class DisbursementController {

    private final DisbursementService disbursementService;

    @PostMapping
    public ResponseEntity<ApiResponse<DisbursementResponse>> executeDisbursement(
            @Valid @RequestBody DisbursementRequest request,
            @RequestHeader(value = "Idempotency-Key") String idempotencyKey) {
        DisbursementResponse response = disbursementService.executeDisbursement(request, idempotencyKey);
        String message = Boolean.TRUE.equals(response.getIsDuplicateRequest())
                ? "Duplicate request detected — returned existing disbursement transaction"
                : "Funds disbursed successfully";
        return ResponseEntity.ok(ApiResponse.success(message, response));
    }

    @GetMapping("/applications/{applicationId}")
    public ResponseEntity<ApiResponse<DisbursementResponse>> getDisbursementByApplicationId(
            @PathVariable Long applicationId) {
        DisbursementResponse response = disbursementService.getDisbursementByApplicationId(applicationId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
