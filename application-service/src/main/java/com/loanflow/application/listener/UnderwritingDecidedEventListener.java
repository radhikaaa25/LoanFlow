package com.loanflow.application.listener;

import com.loanflow.application.entity.LoanApplication;
import com.loanflow.application.repository.LoanApplicationRepository;
import com.loanflow.common.enums.ApplicationStatus;
import com.loanflow.common.enums.UnderwritingStatus;
import com.loanflow.common.event.UnderwritingDecidedEvent;
import com.loanflow.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class UnderwritingDecidedEventListener {

    private final LoanApplicationRepository applicationRepository;

    /**
     * Valid predecessor statuses for an underwriting decision.
     * Once an application reaches DISBURSED or DISBURSEMENT_FAILED,
     * underwriting events must not revert it.
     */
    private static final Set<ApplicationStatus> ALLOWED_PREDECESSORS = Set.of(
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.CREDIT_CHECK_IN_PROGRESS,
            ApplicationStatus.CREDIT_CHECKED,
            ApplicationStatus.UNDERWRITING_IN_PROGRESS,
            ApplicationStatus.FLAGGED_FOR_MANUAL_REVIEW
    );

    @KafkaListener(topics = "underwriting-decided", groupId = "application-group")
    @Transactional
    public void handleUnderwritingDecided(UnderwritingDecidedEvent event) {
        log.info("Received UnderwritingDecidedEvent for Application ID: {} | Decision: {}",
                event.getApplicationId(), event.getStatus());

        LoanApplication application = applicationRepository.findById(event.getApplicationId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Loan application not found with ID: " + event.getApplicationId()));

        // State guard: don't regress from terminal states
        if (!ALLOWED_PREDECESSORS.contains(application.getStatus())) {
            log.warn("Ignoring UnderwritingDecidedEvent for Application ID: {} — status is already {} (past underwriting)",
                    event.getApplicationId(), application.getStatus());
            return;
        }

        ApplicationStatus newStatus;
        if (event.getStatus() == UnderwritingStatus.APPROVED) {
            newStatus = ApplicationStatus.APPROVED;
        } else if (event.getStatus() == UnderwritingStatus.REJECTED) {
            newStatus = ApplicationStatus.REJECTED;
        } else {
            newStatus = ApplicationStatus.FLAGGED_FOR_MANUAL_REVIEW;
        }

        application.setStatus(newStatus);
        applicationRepository.save(application);

        log.info("Application ID: {} status updated to {}", event.getApplicationId(), newStatus);
    }
}
