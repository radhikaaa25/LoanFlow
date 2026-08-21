package com.loanflow.underwriting.service.impl;

import com.loanflow.common.enums.UnderwritingStatus;
import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.common.event.UnderwritingDecidedEvent;
import com.loanflow.common.exception.ResourceNotFoundException;
import com.loanflow.underwriting.dto.ManualDecisionRequest;
import com.loanflow.underwriting.dto.UnderwritingResponse;
import com.loanflow.underwriting.entity.UnderwritingDecision;
import com.loanflow.underwriting.repository.UnderwritingDecisionRepository;
import com.loanflow.underwriting.service.UnderwritingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class UnderwritingServiceImpl implements UnderwritingService {

    public static final String TOPIC_UNDERWRITING_DECIDED = "underwriting-decided";

    private final UnderwritingDecisionRepository decisionRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Override
    @Transactional
    public UnderwritingResponse evaluateAutomatedDecision(CreditScoredEvent event) {
        log.info("Evaluating automated underwriting decision for Application ID: {}, Score: {}",
                event.getApplicationId(), event.getCreditScore());

        UnderwritingStatus status;
        BigDecimal approvedAmount = null;
        BigDecimal interestRate = null;
        String notes;

        int score = event.getCreditScore();
        if (score >= 700) {
            status = UnderwritingStatus.APPROVED;
            interestRate = score >= 750 ? BigDecimal.valueOf(5.5) : BigDecimal.valueOf(7.5);
            notes = "Auto-approved based on credit score (" + score + ")";
        } else if (score < 550) {
            status = UnderwritingStatus.REJECTED;
            notes = "Auto-rejected: Credit score (" + score + ") below minimum threshold of 550";
        } else {
            status = UnderwritingStatus.FLAGGED_FOR_MANUAL_REVIEW;
            notes = "Flagged for manual review: Credit score (" + score + ") requires underwriter inspection";
        }

        UnderwritingDecision decision = UnderwritingDecision.builder()
                .applicationId(event.getApplicationId())
                .applicantId(event.getApplicantId())
                .creditScore(event.getCreditScore())
                .status(status)
                .approvedAmount(approvedAmount)
                .interestRate(interestRate)
                .decisionNotes(notes)
                .build();

        UnderwritingDecision savedDecision = decisionRepository.save(decision);

        // Publish event if decision is final (APPROVED or REJECTED)
        if (status == UnderwritingStatus.APPROVED || status == UnderwritingStatus.REJECTED) {
            publishEvent(savedDecision);
        }

        return mapToResponse(savedDecision);
    }

    @Override
    @Transactional
    public UnderwritingResponse submitManualDecision(ManualDecisionRequest request) {
        log.info("Submitting manual underwriting decision for Application ID: {}", request.getApplicationId());

        UnderwritingDecision decision = decisionRepository.findByApplicationId(request.getApplicationId())
                .orElseThrow(() -> new ResourceNotFoundException("Underwriting record not found for application: " + request.getApplicationId()));

        decision.setStatus(request.getStatus());
        decision.setApprovedAmount(request.getApprovedAmount());
        decision.setInterestRate(request.getInterestRate());
        decision.setDecisionNotes(request.getDecisionNotes());
        decision.setUnderwriterId(request.getUnderwriterId());

        UnderwritingDecision savedDecision = decisionRepository.save(decision);
        publishEvent(savedDecision);

        return mapToResponse(savedDecision);
    }

    @Override
    public UnderwritingResponse getDecisionByApplicationId(Long applicationId) {
        UnderwritingDecision decision = decisionRepository.findByApplicationId(applicationId)
                .orElseThrow(() -> new ResourceNotFoundException("Underwriting decision not found for application: " + applicationId));
        return mapToResponse(decision);
    }

    private void publishEvent(UnderwritingDecision decision) {
        UnderwritingDecidedEvent event = UnderwritingDecidedEvent.builder()
                .applicationId(decision.getApplicationId())
                .applicantId(decision.getApplicantId())
                .status(decision.getStatus())
                .approvedAmount(decision.getApprovedAmount())
                .interestRate(decision.getInterestRate())
                .decisionNotes(decision.getDecisionNotes())
                .underwriterId(decision.getUnderwriterId())
                .timestamp(LocalDateTime.now())
                .build();

        try {
            kafkaTemplate.send(TOPIC_UNDERWRITING_DECIDED, decision.getApplicationId().toString(), event);
            log.info("Published UnderwritingDecidedEvent for Application ID: {}, Status: {}",
                    decision.getApplicationId(), decision.getStatus());
        } catch (Exception e) {
            log.error("Failed to publish UnderwritingDecidedEvent for Application ID: {}", decision.getApplicationId(), e);
        }
    }

    private UnderwritingResponse mapToResponse(UnderwritingDecision decision) {
        return UnderwritingResponse.builder()
                .id(decision.getId())
                .applicationId(decision.getApplicationId())
                .applicantId(decision.getApplicantId())
                .creditScore(decision.getCreditScore())
                .status(decision.getStatus())
                .approvedAmount(decision.getApprovedAmount())
                .interestRate(decision.getInterestRate())
                .decisionNotes(decision.getDecisionNotes())
                .underwriterId(decision.getUnderwriterId())
                .createdAt(decision.getCreatedAt())
                .build();
    }
}
