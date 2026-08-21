package com.loanflow.notification.service.impl;

import com.loanflow.common.event.ApplicationSubmittedEvent;
import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.common.event.DisbursedEvent;
import com.loanflow.common.event.UnderwritingDecidedEvent;
import com.loanflow.notification.entity.NotificationLog;
import com.loanflow.notification.repository.NotificationLogRepository;
import com.loanflow.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationServiceImpl implements NotificationService {

    private final NotificationLogRepository repository;

    @Override
    public void sendApplicationSubmittedNotification(ApplicationSubmittedEvent event) {
        String msg = String.format("Dear %s, your loan application #%d for $%s has been submitted successfully and is currently undergoing credit evaluation.",
                event.getApplicantName(), event.getApplicationId(), event.getRequestedAmount());

        logNotification("EMAIL", event.getApplicationId(), event.getApplicantId(), "APPLICATION_SUBMITTED", "loan-application-submitted", msg);
    }

    @Override
    public void sendCreditScoredNotification(CreditScoredEvent event) {
        String msg = String.format("Credit evaluation complete for Application #%d. Calculated Credit Score: %d (%s).",
                event.getApplicationId(), event.getCreditScore(), event.getCreditTier());

        logNotification("EMAIL", event.getApplicationId(), event.getApplicantId(), "CREDIT_SCORED", "credit-scored", msg);
    }

    @Override
    public void sendUnderwritingDecidedNotification(UnderwritingDecidedEvent event) {
        String msg = String.format("Underwriting Decision for Application #%d: Status is %s. Notes: %s",
                event.getApplicationId(), event.getStatus(), event.getDecisionNotes());

        logNotification("EMAIL_AND_SMS", event.getApplicationId(), event.getApplicantId(), "UNDERWRITING_DECISION", "underwriting-decided", msg);
    }

    @Override
    public void sendDisbursementCompletedNotification(DisbursedEvent event) {
        String msg = String.format("SUCCESS! Funds of $%s have been disbursed to bank account %s for Application #%d. Transaction Ref: %s",
                event.getAmount(), event.getBankAccountNumber(), event.getApplicationId(), event.getTransactionRef());

        logNotification("SMS", event.getApplicationId(), event.getApplicantId(), "DISBURSEMENT_COMPLETED", "disbursement-completed", msg);
    }

    @Override
    public List<NotificationLog> getNotificationsByApplicationId(Long applicationId) {
        return repository.findByApplicationId(applicationId);
    }

    private void logNotification(String channel, Long applicationId, Long applicantId, String type, String topic, String message) {
        log.info("📢 [NOTIFICATION SENT - {}] AppId: {} | Msg: {}", channel, applicationId, message);

        NotificationLog entry = NotificationLog.builder()
                .applicationId(applicationId)
                .applicantId(applicantId)
                .eventTopic(topic)
                .notificationType(type)
                .channel(channel)
                .message(message)
                .status("SENT")
                .build();

        repository.save(entry);
    }
}
