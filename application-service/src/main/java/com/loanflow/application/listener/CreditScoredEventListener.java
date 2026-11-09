package com.loanflow.application.listener;

import com.loanflow.application.entity.LoanApplication;
import com.loanflow.application.repository.LoanApplicationRepository;
import com.loanflow.common.enums.ApplicationStatus;
import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Component
@RequiredArgsConstructor
public class CreditScoredEventListener {

    private final LoanApplicationRepository applicationRepository;

    @KafkaListener(topics = "credit-scored", groupId = "application-group")
    @Transactional
    public void handleCreditScored(CreditScoredEvent event) {
        log.info("Received CreditScoredEvent for Application ID: {} | Score: {} | Tier: {}",
                event.getApplicationId(), event.getCreditScore(), event.getCreditTier());

        LoanApplication application = applicationRepository.findById(event.getApplicationId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Loan application not found with ID: " + event.getApplicationId()));

        // State guard: only advance from SUBMITTED or CREDIT_CHECK_IN_PROGRESS
        if (application.getStatus() != ApplicationStatus.SUBMITTED
                && application.getStatus() != ApplicationStatus.CREDIT_CHECK_IN_PROGRESS) {
            log.warn("Ignoring CreditScoredEvent for Application ID: {} — status is already {} (past CREDIT_CHECKED)",
                    event.getApplicationId(), application.getStatus());
            return;
        }

        application.setStatus(ApplicationStatus.CREDIT_CHECKED);
        applicationRepository.save(application);

        log.info("Application ID: {} status updated to CREDIT_CHECKED", event.getApplicationId());
    }
}
