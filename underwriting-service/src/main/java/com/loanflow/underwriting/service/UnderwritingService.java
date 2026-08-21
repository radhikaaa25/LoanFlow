package com.loanflow.underwriting.service;

import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.underwriting.dto.ManualDecisionRequest;
import com.loanflow.underwriting.dto.UnderwritingResponse;

public interface UnderwritingService {
    UnderwritingResponse evaluateAutomatedDecision(CreditScoredEvent event);
    UnderwritingResponse submitManualDecision(ManualDecisionRequest request);
    UnderwritingResponse getDecisionByApplicationId(Long applicationId);
}
