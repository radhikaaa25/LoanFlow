package com.loanflow.disbursement.service;

import com.loanflow.common.event.UnderwritingDecidedEvent;
import com.loanflow.disbursement.dto.DisbursementRequest;
import com.loanflow.disbursement.dto.DisbursementResponse;

public interface DisbursementService {
    DisbursementResponse executeDisbursement(DisbursementRequest request, String idempotencyKey);
    DisbursementResponse processAutomatedDisbursement(UnderwritingDecidedEvent event);
    DisbursementResponse getDisbursementByApplicationId(Long applicationId);
}
