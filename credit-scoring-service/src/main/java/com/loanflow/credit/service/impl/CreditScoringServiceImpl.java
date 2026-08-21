package com.loanflow.credit.service.impl;

import com.loanflow.common.enums.CreditTier;
import com.loanflow.common.event.ApplicationSubmittedEvent;
import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.credit.client.CreditBureauClient;
import com.loanflow.credit.entity.CreditReport;
import com.loanflow.credit.repository.CreditReportRepository;
import com.loanflow.credit.service.CreditScoringService;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class CreditScoringServiceImpl implements CreditScoringService {

    public static final String TOPIC_CREDIT_SCORED = "credit-scored";

    private final CreditBureauClient bureauClient;
    private final CreditReportRepository creditReportRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Override
    @Transactional
    @CircuitBreaker(name = "creditBureauService", fallbackMethod = "fallbackCreditEvaluation")
    public CreditScoredEvent processCreditEvaluation(ApplicationSubmittedEvent event) {
        log.info("Processing credit evaluation for Application ID: {}", event.getApplicationId());

        int score = bureauClient.fetchScoreFromBureau(event.getSsn());
        CreditTier tier = calculateTier(score);
        BigDecimal dtiRatio = calculateDti(event.getMonthlyIncome(), event.getRequestedAmount());

        CreditReport report = CreditReport.builder()
                .applicationId(event.getApplicationId())
                .applicantId(event.getApplicantId())
                .creditScore(score)
                .creditTier(tier)
                .debtToIncomeRatio(dtiRatio)
                .isFallbackUsed(false)
                .build();

        creditReportRepository.save(report);

        CreditScoredEvent scoredEvent = CreditScoredEvent.builder()
                .applicationId(event.getApplicationId())
                .applicantId(event.getApplicantId())
                .creditScore(score)
                .creditTier(tier)
                .debtToIncomeRatio(dtiRatio)
                .isFallbackUsed(false)
                .timestamp(LocalDateTime.now())
                .build();

        publishEvent(scoredEvent);
        return scoredEvent;
    }

    public CreditScoredEvent fallbackCreditEvaluation(ApplicationSubmittedEvent event, Throwable t) {
        log.warn("Circuit Breaker triggered for Application ID: {}. Reason: {}", event.getApplicationId(), t.getMessage());

        // Fallback: Assign conservative tier (600 score) when external bureau is unreachable
        int fallbackScore = 600;
        CreditTier fallbackTier = CreditTier.FAIR;
        BigDecimal dtiRatio = calculateDti(event.getMonthlyIncome(), event.getRequestedAmount());

        CreditReport report = CreditReport.builder()
                .applicationId(event.getApplicationId())
                .applicantId(event.getApplicantId())
                .creditScore(fallbackScore)
                .creditTier(fallbackTier)
                .debtToIncomeRatio(dtiRatio)
                .isFallbackUsed(true)
                .build();

        creditReportRepository.save(report);

        CreditScoredEvent scoredEvent = CreditScoredEvent.builder()
                .applicationId(event.getApplicationId())
                .applicantId(event.getApplicantId())
                .creditScore(fallbackScore)
                .creditTier(fallbackTier)
                .debtToIncomeRatio(dtiRatio)
                .isFallbackUsed(true)
                .timestamp(LocalDateTime.now())
                .build();

        publishEvent(scoredEvent);
        return scoredEvent;
    }

    private void publishEvent(CreditScoredEvent scoredEvent) {
        try {
            kafkaTemplate.send(TOPIC_CREDIT_SCORED, scoredEvent.getApplicationId().toString(), scoredEvent);
            log.info("Published CreditScoredEvent for Application ID: {}, Score: {}, Fallback: {}",
                    scoredEvent.getApplicationId(), scoredEvent.getCreditScore(), scoredEvent.getIsFallbackUsed());
        } catch (Exception e) {
            log.error("Failed to publish CreditScoredEvent for Application ID: {}", scoredEvent.getApplicationId(), e);
        }
    }

    private CreditTier calculateTier(int score) {
        if (score >= 750) return CreditTier.EXCELLENT;
        if (score >= 700) return CreditTier.GOOD;
        if (score >= 600) return CreditTier.FAIR;
        return CreditTier.POOR;
    }

    private BigDecimal calculateDti(BigDecimal monthlyIncome, BigDecimal requestedAmount) {
        if (monthlyIncome == null || monthlyIncome.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.valueOf(0.5);
        }
        // Estimated monthly payment assumes 5% of requested amount
        BigDecimal estimatedMonthlyPayment = requestedAmount.multiply(BigDecimal.valueOf(0.05));
        return estimatedMonthlyPayment.divide(monthlyIncome, 2, RoundingMode.HALF_UP);
    }
}
