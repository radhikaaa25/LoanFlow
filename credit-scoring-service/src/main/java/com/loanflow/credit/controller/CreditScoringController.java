package com.loanflow.credit.controller;

import com.loanflow.common.dto.ApiResponse;
import com.loanflow.credit.entity.CreditReport;
import com.loanflow.credit.repository.CreditReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/credit")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class CreditScoringController {

    private final CreditReportRepository creditReportRepository;

    @GetMapping("/applications/{applicationId}")
    public ResponseEntity<ApiResponse<CreditReport>> getReportByApplicationId(@PathVariable Long applicationId) {
        return creditReportRepository.findByApplicationId(applicationId)
                .map(report -> ResponseEntity.ok(ApiResponse.success(report)))
                .orElse(ResponseEntity.ok(ApiResponse.error("Credit report not found for application " + applicationId)));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<CreditReport>>> getAllReports() {
        return ResponseEntity.ok(ApiResponse.success(creditReportRepository.findAll()));
    }
}
