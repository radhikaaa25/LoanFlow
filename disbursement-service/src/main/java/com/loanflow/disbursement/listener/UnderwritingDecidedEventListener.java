package com.loanflow.disbursement.listener;

import com.loanflow.common.enums.UnderwritingStatus;
import com.loanflow.common.event.UnderwritingDecidedEvent;
import com.loanflow.disbursement.service.DisbursementService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class UnderwritingDecidedEventListener {

    private final DisbursementService disbursementService;

    @KafkaListener(topics = "underwriting-decided", groupId = "disbursement-group")
    public void handleUnderwritingDecided(UnderwritingDecidedEvent event) {
        log.info("Received UnderwritingDecidedEvent for Application ID: {}, Status: {}",
                event.getApplicationId(), event.getStatus());

        if (event.getStatus() == UnderwritingStatus.APPROVED) {
            disbursementService.processAutomatedDisbursement(event);
        }
    }
}
