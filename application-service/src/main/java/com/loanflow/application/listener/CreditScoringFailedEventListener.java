package com.loanflow.application.listener;

import com.loanflow.application.entity.LoanApplication;
import com.loanflow.application.repository.LoanApplicationRepository;
import com.loanflow.common.enums.ApplicationStatus;
import com.loanflow.common.event.CreditScoringFailedEvent;
import com.loanflow.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Saga compensation listener: marks the application as failed when credit scoring
 * cannot complete (e.g., circuit breaker fully open with no fallback, unrecoverable errors).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CreditScoringFailedEventListener {

    private final LoanApplicationRepository applicationRepository;

    @KafkaListener(topics = "credit-scoring-failed", groupId = "application-group")
    @Transactional
    public void handleCreditScoringFailed(CreditScoringFailedEvent event) {
        log.warn("COMPENSATION: Received CreditScoringFailedEvent for Application ID: {} | Reason: {}",
                event.getApplicationId(), event.getFailureReason());

        LoanApplication application = applicationRepository.findById(event.getApplicationId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Loan application not found with ID: " + event.getApplicationId()));

        application.setStatus(ApplicationStatus.CREDIT_CHECK_FAILED);
        applicationRepository.save(application);

        log.warn("COMPENSATION: Application ID: {} status set to CREDIT_CHECK_FAILED",
                event.getApplicationId());
    }
}

