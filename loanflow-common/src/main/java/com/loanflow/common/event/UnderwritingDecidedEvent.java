package com.loanflow.common.event;

import com.loanflow.common.enums.UnderwritingStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UnderwritingDecidedEvent {
    private Long applicationId;
    private Long applicantId;
    private UnderwritingStatus status;
    private BigDecimal approvedAmount;
    private BigDecimal interestRate;
    private String decisionNotes;
    private Long underwriterId;
    private LocalDateTime timestamp;
}
