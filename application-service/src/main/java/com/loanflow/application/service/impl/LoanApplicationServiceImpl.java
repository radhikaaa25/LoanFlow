package com.loanflow.application.service.impl;

import com.loanflow.application.dto.LoanApplicationRequest;
import com.loanflow.application.dto.LoanApplicationResponse;
import com.loanflow.application.entity.Applicant;
import com.loanflow.application.entity.LoanApplication;
import com.loanflow.application.repository.ApplicantRepository;
import com.loanflow.application.repository.LoanApplicationRepository;
import com.loanflow.application.service.LoanApplicationService;
import com.loanflow.common.enums.ApplicationStatus;
import com.loanflow.common.event.ApplicationSubmittedEvent;
import com.loanflow.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class LoanApplicationServiceImpl implements LoanApplicationService {

    public static final String TOPIC_APPLICATION_SUBMITTED = "loan-application-submitted";

    private final LoanApplicationRepository applicationRepository;
    private final ApplicantRepository applicantRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Override
    @Transactional
    public LoanApplicationResponse submitApplication(LoanApplicationRequest request, String applicantEmail) {
        Applicant applicant = applicantRepository.findByEmail(applicantEmail)
                .orElseThrow(() -> new ResourceNotFoundException("Applicant not found with email: " + applicantEmail));

        LoanApplication application = LoanApplication.builder()
                .applicant(applicant)
                .requestedAmount(request.getRequestedAmount())
                .loanTermMonths(request.getLoanTermMonths())
                .kycDocumentRef(request.getKycDocumentRef())
                .status(ApplicationStatus.SUBMITTED)
                .build();

        LoanApplication savedApplication = applicationRepository.save(application);

        // Publish event to Kafka for Credit Scoring Service
        ApplicationSubmittedEvent event = ApplicationSubmittedEvent.builder()
                .applicationId(savedApplication.getId())
                .applicantId(applicant.getId())
                .applicantName(applicant.getName())
                .applicantEmail(applicant.getEmail())
                .ssn(applicant.getSsn())
                .monthlyIncome(applicant.getMonthlyIncome())
                .requestedAmount(savedApplication.getRequestedAmount())
                .loanTermMonths(savedApplication.getLoanTermMonths())
                .kycDocumentRef(savedApplication.getKycDocumentRef())
                .timestamp(LocalDateTime.now())
                .build();

        try {
            kafkaTemplate.send(TOPIC_APPLICATION_SUBMITTED, savedApplication.getId().toString(), event);
            log.info("Published ApplicationSubmittedEvent for Application ID: {}", savedApplication.getId());
        } catch (Exception e) {
            log.error("Failed to publish Kafka event for Application ID: {}", savedApplication.getId(), e);
        }

        return mapToResponse(savedApplication);
    }

    @Override
    public LoanApplicationResponse getApplicationById(Long id, String applicantEmail) {
        LoanApplication application = applicationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Loan application not found with ID: " + id));

        return mapToResponse(application);
    }

    @Override
    public List<LoanApplicationResponse> getApplicantApplications(String applicantEmail) {
        Applicant applicant = applicantRepository.findByEmail(applicantEmail)
                .orElseThrow(() -> new ResourceNotFoundException("Applicant not found with email: " + applicantEmail));

        return applicationRepository.findByApplicantId(applicant.getId()).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    private LoanApplicationResponse mapToResponse(LoanApplication app) {
        return LoanApplicationResponse.builder()
                .id(app.getId())
                .applicantId(app.getApplicant().getId())
                .applicantName(app.getApplicant().getName())
                .applicantEmail(app.getApplicant().getEmail())
                .requestedAmount(app.getRequestedAmount())
                .loanTermMonths(app.getLoanTermMonths())
                .kycDocumentRef(app.getKycDocumentRef())
                .status(app.getStatus())
                .createdAt(app.getCreatedAt())
                .updatedAt(app.getUpdatedAt())
                .build();
    }
}
