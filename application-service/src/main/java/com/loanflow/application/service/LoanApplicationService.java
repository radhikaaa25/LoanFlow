package com.loanflow.application.service;

import com.loanflow.application.dto.LoanApplicationRequest;
import com.loanflow.application.dto.LoanApplicationResponse;

import java.util.List;

public interface LoanApplicationService {
    LoanApplicationResponse submitApplication(LoanApplicationRequest request, String applicantEmail);
    LoanApplicationResponse getApplicationById(Long id, String applicantEmail);
    List<LoanApplicationResponse> getApplicantApplications(String applicantEmail);
}
