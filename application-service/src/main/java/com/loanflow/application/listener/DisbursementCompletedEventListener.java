package com.loanflow.application.listener;

import com.loanflow.application.entity.LoanApplication;
import com.loanflow.application.repository.LoanApplicationRepository;
import com.loanflow.common.enums.ApplicationStatus;
import com.loanflow.common.event.DisbursedEvent;
import com.loanflow.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Component
@RequiredArgsConstructor
public class DisbursementCompletedEventListener {

    private final LoanApplicationRepository applicationRepository;

    @KafkaListener(topics = "disbursement-completed", groupId = "application-group")
    @Transactional
    public void handleDisbursementCompleted(DisbursedEvent event) {
        log.info("Received DisbursedEvent for Application ID: {} | Transaction: {}",
                event.getApplicationId(), event.getTransactionRef());

        LoanApplication application = applicationRepository.findById(event.getApplicationId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Loan application not found with ID: " + event.getApplicationId()));

        // State guard: only advance from APPROVED
        if (application.getStatus() != ApplicationStatus.APPROVED) {
            log.warn("Ignoring DisbursedEvent for Application ID: {} — status is {} (expected APPROVED)",
                    event.getApplicationId(), application.getStatus());
            return;
        }

        application.setStatus(ApplicationStatus.DISBURSED);
        applicationRepository.save(application);

        log.info("Application ID: {} status updated to DISBURSED | Amount: {}",
                event.getApplicationId(), event.getAmount());
    }
}
