package com.loanflow.credit.service;

import com.loanflow.common.event.ApplicationSubmittedEvent;
import com.loanflow.common.event.CreditScoredEvent;

public interface CreditScoringService {
    CreditScoredEvent processCreditEvaluation(ApplicationSubmittedEvent event);
}
