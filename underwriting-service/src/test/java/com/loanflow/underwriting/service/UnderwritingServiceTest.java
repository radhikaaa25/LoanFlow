package com.loanflow.underwriting.service;

import com.loanflow.common.enums.CreditTier;
import com.loanflow.common.enums.UnderwritingStatus;
import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.underwriting.dto.UnderwritingResponse;
import com.loanflow.underwriting.entity.UnderwritingDecision;
import com.loanflow.underwriting.repository.UnderwritingDecisionRepository;
import com.loanflow.underwriting.service.impl.UnderwritingServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UnderwritingServiceTest {

    @Mock
    private UnderwritingDecisionRepository decisionRepository;

    @Mock
    private KafkaTemplate<String, Object> kafkaTemplate;

    @InjectMocks
    private UnderwritingServiceImpl underwritingService;

    @Test
    void evaluateAutomatedDecision_ShouldApprove_WhenScoreIs750() {
        CreditScoredEvent event = CreditScoredEvent.builder()
                .applicationId(101L)
                .applicantId(1L)
                .creditScore(760)
                .creditTier(CreditTier.EXCELLENT)
                .build();

        when(decisionRepository.save(any(UnderwritingDecision.class))).thenAnswer(i -> i.getArgument(0));

        UnderwritingResponse response = underwritingService.evaluateAutomatedDecision(event);

        assertNotNull(response);
        assertEquals(UnderwritingStatus.APPROVED, response.getStatus());
        assertEquals(760, response.getCreditScore());
    }

    @Test
    void evaluateAutomatedDecision_ShouldReject_WhenScoreIsBelow550() {
        CreditScoredEvent event = CreditScoredEvent.builder()
                .applicationId(102L)
                .applicantId(2L)
                .creditScore(520)
                .creditTier(CreditTier.POOR)
                .build();

        when(decisionRepository.save(any(UnderwritingDecision.class))).thenAnswer(i -> i.getArgument(0));

        UnderwritingResponse response = underwritingService.evaluateAutomatedDecision(event);

        assertNotNull(response);
        assertEquals(UnderwritingStatus.REJECTED, response.getStatus());
    }

    @Test
    void evaluateAutomatedDecision_ShouldFlagForManualReview_WhenScoreIsBetween550And699() {
        CreditScoredEvent event = CreditScoredEvent.builder()
                .applicationId(103L)
                .applicantId(3L)
                .creditScore(640)
                .creditTier(CreditTier.FAIR)
                .build();

        when(decisionRepository.save(any(UnderwritingDecision.class))).thenAnswer(i -> i.getArgument(0));

        UnderwritingResponse response = underwritingService.evaluateAutomatedDecision(event);

        assertNotNull(response);
        assertEquals(UnderwritingStatus.FLAGGED_FOR_MANUAL_REVIEW, response.getStatus());
    }
}
