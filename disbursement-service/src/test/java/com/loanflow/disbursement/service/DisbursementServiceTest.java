package com.loanflow.disbursement.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loanflow.common.enums.DisbursementStatus;
import com.loanflow.disbursement.dto.DisbursementRequest;
import com.loanflow.disbursement.dto.DisbursementResponse;
import com.loanflow.disbursement.entity.Disbursement;
import com.loanflow.disbursement.entity.IdempotencyLog;
import com.loanflow.disbursement.repository.DisbursementRepository;
import com.loanflow.disbursement.repository.IdempotencyLogRepository;
import com.loanflow.disbursement.service.impl.DisbursementServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DisbursementServiceTest {

    @Mock
    private DisbursementRepository disbursementRepository;

    @Mock
    private IdempotencyLogRepository idempotencyLogRepository;

    @Mock
    private KafkaTemplate<String, Object> kafkaTemplate;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private DisbursementServiceImpl disbursementService;

    private DisbursementRequest request;
    private String idempotencyKey;

    @BeforeEach
    void setUp() {
        idempotencyKey = "IDEM-KEY-12345";
        request = DisbursementRequest.builder()
                .applicationId(101L)
                .applicantId(1L)
                .amount(BigDecimal.valueOf(25000))
                .bankAccountNumber("ACCT-987654321")
                .build();
    }

    @Test
    void executeDisbursement_ShouldCreateNewDisbursement_WhenFirstAttempt() {
        when(idempotencyLogRepository.findByIdempotencyKey(idempotencyKey)).thenReturn(Optional.empty());
        when(disbursementRepository.save(any(Disbursement.class))).thenAnswer(i -> {
            Disbursement d = i.getArgument(0);
            d.setId(1L);
            return d;
        });

        DisbursementResponse response = disbursementService.executeDisbursement(request, idempotencyKey);

        assertNotNull(response);
        assertEquals(DisbursementStatus.SUCCESS, response.getStatus());
        assertFalse(response.getIsDuplicateRequest());
        assertEquals(idempotencyKey, response.getIdempotencyKey());
        verify(disbursementRepository, times(1)).save(any(Disbursement.class));
        verify(idempotencyLogRepository, times(1)).save(any(IdempotencyLog.class));
    }

    @Test
    void executeDisbursement_ShouldReturnCachedResult_WhenDuplicateIdempotencyKey() throws Exception {
        DisbursementResponse originalResponse = DisbursementResponse.builder()
                .id(1L)
                .applicationId(101L)
                .applicantId(1L)
                .amount(BigDecimal.valueOf(25000))
                .bankAccountNumber("ACCT-987654321")
                .transactionRef("TXN-CACHED-123")
                .idempotencyKey(idempotencyKey)
                .status(DisbursementStatus.SUCCESS)
                .isDuplicateRequest(false)
                .build();

        String cachedJson = objectMapper.writeValueAsString(originalResponse);
        IdempotencyLog cachedLog = IdempotencyLog.builder()
                .idempotencyKey(idempotencyKey)
                .responsePayload(cachedJson)
                .build();

        when(idempotencyLogRepository.findByIdempotencyKey(idempotencyKey)).thenReturn(Optional.of(cachedLog));

        // Act: Perform second call with identical key
        DisbursementResponse duplicateResponse = disbursementService.executeDisbursement(request, idempotencyKey);

        assertNotNull(duplicateResponse);
        assertTrue(duplicateResponse.getIsDuplicateRequest());
        assertEquals("TXN-CACHED-123", duplicateResponse.getTransactionRef());

        // Assert: Disbursement table save is NEVER called again
        verify(disbursementRepository, never()).save(any(Disbursement.class));
    }
}
