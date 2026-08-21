package com.loanflow.credit.entity;

import com.loanflow.common.enums.CreditTier;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "credit_reports")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "applicant_id", nullable = false)
    private Long applicantId;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "credit_score", nullable = false)
    private Integer creditScore;

    @Enumerated(EnumType.STRING)
    @Column(name = "credit_tier", nullable = false)
    private CreditTier creditTier;

    @Column(name = "debt_to_income_ratio")
    private BigDecimal debtToIncomeRatio;

    @Column(name = "is_fallback_used", nullable = false)
    @Builder.Default
    private Boolean isFallbackUsed = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
