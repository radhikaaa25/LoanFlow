package com.loanflow.notification.service;

import com.loanflow.common.event.ApplicationSubmittedEvent;
import com.loanflow.common.event.CreditScoredEvent;
import com.loanflow.common.event.DisbursedEvent;
import com.loanflow.common.event.UnderwritingDecidedEvent;
import com.loanflow.notification.entity.NotificationLog;

import java.util.List;

public interface NotificationService {
    void sendApplicationSubmittedNotification(ApplicationSubmittedEvent event);
    void sendCreditScoredNotification(CreditScoredEvent event);
    void sendUnderwritingDecidedNotification(UnderwritingDecidedEvent event);
    void sendDisbursementCompletedNotification(DisbursedEvent event);
    List<NotificationLog> getNotificationsByApplicationId(Long applicationId);
}
