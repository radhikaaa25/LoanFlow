package com.loanflow.credit.listener;

import com.loanflow.common.event.ApplicationSubmittedEvent;
import com.loanflow.credit.service.CreditScoringService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ApplicationSubmittedEventListener {

    private final CreditScoringService creditScoringService;

    @KafkaListener(topics = "loan-application-submitted", groupId = "credit-group")
    public void handleApplicationSubmitted(ApplicationSubmittedEvent event) {
        log.info("Received ApplicationSubmittedEvent for Application ID: {}", event.getApplicationId());
        creditScoringService.processCreditEvaluation(event);
    }
}
