package com.loanflow.disbursement.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loanflow.common.enums.DisbursementStatus;
import com.loanflow.common.enums.UnderwritingStatus;
import com.loanflow.common.event.DisbursedEvent;
import com.loanflow.common.event.UnderwritingDecidedEvent;
import com.loanflow.common.exception.BusinessLogicException;
import com.loanflow.common.exception.ResourceNotFoundException;
import com.loanflow.disbursement.dto.DisbursementRequest;
import com.loanflow.disbursement.dto.DisbursementResponse;
import com.loanflow.disbursement.entity.Disbursement;
import com.loanflow.disbursement.entity.IdempotencyLog;
import com.loanflow.disbursement.repository.DisbursementRepository;
import com.loanflow.disbursement.repository.IdempotencyLogRepository;
import com.loanflow.disbursement.service.DisbursementService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DisbursementServiceImpl implements DisbursementService {

    public static final String TOPIC_DISBURSEMENT_COMPLETED = "disbursement-completed";

    private final DisbursementRepository disbursementRepository;
    private final IdempotencyLogRepository idempotencyLogRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public DisbursementResponse executeDisbursement(DisbursementRequest request, String idempotencyKey) {
        log.info("Executing disbursement request for Application ID: {} with Idempotency Key: {}",
                request.getApplicationId(), idempotencyKey);

        // 1. Idempotency Check: Return existing record if already processed
        Optional<IdempotencyLog> existingLog = idempotencyLogRepository.findByIdempotencyKey(idempotencyKey);
        if (existingLog.isPresent()) {
            log.warn("DUPLICATE DISBURSEMENT DETECTED for Idempotency Key: {}. Returning cached response without re-funding.", idempotencyKey);
            try {
                DisbursementResponse cachedResponse = objectMapper.readValue(existingLog.get().getResponsePayload(), DisbursementResponse.class);
                cachedResponse.setIsDuplicateRequest(true);
                return cachedResponse;
            } catch (Exception e) {
                log.error("Failed to parse cached idempotency response payload", e);
            }
        }

        // 2. Perform Fund Transfer
        String transactionRef = "TXN-" + UUID.randomUUID().toString().substring(0, 13).toUpperCase();

        Disbursement disbursement = Disbursement.builder()
                .applicationId(request.getApplicationId())
                .applicantId(request.getApplicantId())
                .amount(request.getAmount())
                .bankAccountNumber(request.getBankAccountNumber())
                .transactionRef(transactionRef)
                .idempotencyKey(idempotencyKey)
                .status(DisbursementStatus.SUCCESS)
                .build();

        Disbursement savedDisbursement = disbursementRepository.save(disbursement);

        DisbursementResponse response = mapToResponse(savedDisbursement);
        response.setIsDuplicateRequest(false);

        // 3. Save Idempotency Log record
        try {
            String jsonPayload = objectMapper.writeValueAsString(response);
            IdempotencyLog logEntry = IdempotencyLog.builder()
                    .idempotencyKey(idempotencyKey)
                    .responsePayload(jsonPayload)
                    .build();
            idempotencyLogRepository.save(logEntry);
        } catch (Exception e) {
            log.error("Failed to save idempotency log for key: {}", idempotencyKey, e);
        }

        // 4. Publish Kafka Event
        DisbursedEvent event = DisbursedEvent.builder()
                .disbursementId(savedDisbursement.getId())
                .applicationId(savedDisbursement.getApplicationId())
                .applicantId(savedDisbursement.getApplicantId())
                .amount(savedDisbursement.getAmount())
                .bankAccountNumber(savedDisbursement.getBankAccountNumber())
                .transactionRef(savedDisbursement.getTransactionRef())
                .idempotencyKey(savedDisbursement.getIdempotencyKey())
                .timestamp(LocalDateTime.now())
                .build();

        try {
            kafkaTemplate.send(TOPIC_DISBURSEMENT_COMPLETED, savedDisbursement.getApplicationId().toString(), event);
            log.info("Published DisbursedEvent for Application ID: {}, TxnRef: {}",
                    savedDisbursement.getApplicationId(), savedDisbursement.getTransactionRef());
        } catch (Exception e) {
            log.error("Failed to publish DisbursedEvent for Application ID: {}", savedDisbursement.getApplicationId(), e);
        }

        return response;
    }

    @Override
    @Transactional
    public DisbursementResponse processAutomatedDisbursement(UnderwritingDecidedEvent event) {
        if (event.getStatus() != UnderwritingStatus.APPROVED) {
            log.info("Skipping automated disbursement for Application ID: {} - Status is {}",
                    event.getApplicationId(), event.getStatus());
            throw new BusinessLogicException("Cannot disburse funds for non-approved application");
        }

        String idempotencyKey = "DISB-AUTO-APP-" + event.getApplicationId();
        BigDecimal amount = event.getApprovedAmount() != null ? event.getApprovedAmount() : BigDecimal.valueOf(10000);
        String dummyBankAccount = "ACCT-" + (1000000000L + event.getApplicantId());

        DisbursementRequest request = DisbursementRequest.builder()
                .applicationId(event.getApplicationId())
                .applicantId(event.getApplicantId())
                .amount(amount)
                .bankAccountNumber(dummyBankAccount)
                .build();

        return executeDisbursement(request, idempotencyKey);
    }

    @Override
    public DisbursementResponse getDisbursementByApplicationId(Long applicationId) {
        Disbursement disbursement = disbursementRepository.findByApplicationId(applicationId)
                .orElseThrow(() -> new ResourceNotFoundException("Disbursement not found for application: " + applicationId));
        return mapToResponse(disbursement);
    }

    private DisbursementResponse mapToResponse(Disbursement d) {
        return DisbursementResponse.builder()
                .id(d.getId())
                .applicationId(d.getApplicationId())
                .applicantId(d.getApplicantId())
                .amount(d.getAmount())
                .bankAccountNumber(d.getBankAccountNumber())
                .transactionRef(d.getTransactionRef())
                .idempotencyKey(d.getIdempotencyKey())
                .status(d.getStatus())
                .createdAt(d.getCreatedAt())
                .isDuplicateRequest(false)
                .build();
    }
}
