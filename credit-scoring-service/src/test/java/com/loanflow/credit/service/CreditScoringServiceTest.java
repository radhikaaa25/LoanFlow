package com.loanflow.credit.service;

import com.loanflow.common.enums.CreditTier;
import com.loanflow.common.event.ApplicationSubmittedEvent;
import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.credit.client.CreditBureauClient;
import com.loanflow.credit.entity.CreditReport;
import com.loanflow.credit.repository.CreditReportRepository;
import com.loanflow.credit.service.impl.CreditScoringServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CreditScoringServiceTest {

    @Mock
    private CreditBureauClient bureauClient;

    @Mock
    private CreditReportRepository creditReportRepository;

    @Mock
    private KafkaTemplate<String, Object> kafkaTemplate;

    @InjectMocks
    private CreditScoringServiceImpl creditScoringService;

    private ApplicationSubmittedEvent event;

    @BeforeEach
    void setUp() {
        event = ApplicationSubmittedEvent.builder()
                .applicationId(101L)
                .applicantId(1L)
                .ssn("123-45-6789")
                .monthlyIncome(BigDecimal.valueOf(10000))
                .requestedAmount(BigDecimal.valueOf(50000))
                .build();
    }

    @Test
    void processCreditEvaluation_ShouldReturnNormalScore_WhenBureauSucceeds() {
        when(bureauClient.fetchScoreFromBureau(event.getSsn())).thenReturn(760);
        when(creditReportRepository.save(any(CreditReport.class))).thenAnswer(i -> i.getArgument(0));

        CreditScoredEvent result = creditScoringService.processCreditEvaluation(event);

        assertNotNull(result);
        assertEquals(760, result.getCreditScore());
        assertEquals(CreditTier.EXCELLENT, result.getCreditTier());
        assertFalse(result.getIsFallbackUsed());
        verify(creditReportRepository, times(1)).save(any(CreditReport.class));
    }

    @Test
    void fallbackCreditEvaluation_ShouldReturnFallbackScore_WhenCalled() {
        when(creditReportRepository.save(any(CreditReport.class))).thenAnswer(i -> i.getArgument(0));

        CreditScoredEvent result = creditScoringService.fallbackCreditEvaluation(event, new RuntimeException("Bureau Down"));

        assertNotNull(result);
        assertEquals(600, result.getCreditScore());
        assertEquals(CreditTier.FAIR, result.getCreditTier());
        assertTrue(result.getIsFallbackUsed());
    }
}
