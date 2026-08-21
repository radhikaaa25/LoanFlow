package com.loanflow.underwriting.listener;

import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.underwriting.service.UnderwritingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class CreditScoredEventListener {

    private final UnderwritingService underwritingService;

    @KafkaListener(topics = "credit-scored", groupId = "underwriting-group")
    public void handleCreditScored(CreditScoredEvent event) {
        log.info("Received CreditScoredEvent for Application ID: {}", event.getApplicationId());
        underwritingService.evaluateAutomatedDecision(event);
    }
}
