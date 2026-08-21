package com.loanflow.notification.repository;

import com.loanflow.notification.entity.NotificationLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationLogRepository extends JpaRepository<NotificationLog, Long> {
    List<NotificationLog> findByApplicationId(Long applicationId);
    List<NotificationLog> findByApplicantId(Long applicantId);
}
