package com.loanflow.notification.listener;

import com.loanflow.common.event.ApplicationSubmittedEvent;
import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.common.event.DisbursedEvent;
import com.loanflow.common.event.UnderwritingDecidedEvent;
import com.loanflow.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PipelineNotificationListener {

    private final NotificationService notificationService;

    @KafkaListener(topics = "loan-application-submitted", groupId = "notification-group")
    public void onApplicationSubmitted(ApplicationSubmittedEvent event) {
        log.info("Notification Service received ApplicationSubmittedEvent for AppId: {}", event.getApplicationId());
        notificationService.sendApplicationSubmittedNotification(event);
    }

    @KafkaListener(topics = "credit-scored", groupId = "notification-group")
    public void onCreditScored(CreditScoredEvent event) {
        log.info("Notification Service received CreditScoredEvent for AppId: {}", event.getApplicationId());
        notificationService.sendCreditScoredNotification(event);
    }

    @KafkaListener(topics = "underwriting-decided", groupId = "notification-group")
    public void onUnderwritingDecided(UnderwritingDecidedEvent event) {
        log.info("Notification Service received UnderwritingDecidedEvent for AppId: {}", event.getApplicationId());
        notificationService.sendUnderwritingDecidedNotification(event);
    }

    @KafkaListener(topics = "disbursement-completed", groupId = "notification-group")
    public void onDisbursementCompleted(DisbursedEvent event) {
        log.info("Notification Service received DisbursedEvent for AppId: {}", event.getApplicationId());
        notificationService.sendDisbursementCompletedNotification(event);
    }
}
