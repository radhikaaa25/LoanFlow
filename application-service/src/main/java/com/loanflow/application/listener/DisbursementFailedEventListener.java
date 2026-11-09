package com.loanflow.application.listener;

import com.loanflow.application.entity.LoanApplication;
import com.loanflow.application.repository.LoanApplicationRepository;
import com.loanflow.common.enums.ApplicationStatus;
import com.loanflow.common.event.DisbursementFailedEvent;
import com.loanflow.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Saga compensation listener: reverts the application status when disbursement fails.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DisbursementFailedEventListener {

    private final LoanApplicationRepository applicationRepository;

    @KafkaListener(topics = "disbursement-failed", groupId = "application-group")
    @Transactional
    public void handleDisbursementFailed(DisbursementFailedEvent event) {
        log.warn("COMPENSATION: Received DisbursementFailedEvent for Application ID: {} | Reason: {}",
                event.getApplicationId(), event.getFailureReason());

        LoanApplication application = applicationRepository.findById(event.getApplicationId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Loan application not found with ID: " + event.getApplicationId()));

        application.setStatus(ApplicationStatus.DISBURSEMENT_FAILED);
        applicationRepository.save(application);

        log.warn("COMPENSATION: Application ID: {} status reverted to DISBURSEMENT_FAILED",
                event.getApplicationId());
    }
}

