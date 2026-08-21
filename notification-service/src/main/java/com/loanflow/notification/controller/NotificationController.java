package com.loanflow.notification.controller;

import com.loanflow.common.dto.ApiResponse;
import com.loanflow.notification.entity.NotificationLog;
import com.loanflow.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/applications/{applicationId}")
    public ResponseEntity<ApiResponse<List<NotificationLog>>> getNotificationsByApplication(
            @PathVariable Long applicationId) {
        List<NotificationLog> logs = notificationService.getNotificationsByApplicationId(applicationId);
        return ResponseEntity.ok(ApiResponse.success(logs));
    }
}
