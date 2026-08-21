package com.loanflow.credit.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Random;

@Slf4j
@Component
public class ExternalCreditBureauClientImpl implements CreditBureauClient {

    private final Random random = new Random();

    @Override
    public int fetchScoreFromBureau(String ssn) {
        log.info("Calling External Credit Bureau for SSN: {}", maskSsn(ssn));

        // Simulate bureau failure for test SSN ending in 9999
        if (ssn != null && ssn.endsWith("9999")) {
            log.warn("External Credit Bureau Service UNAVAILABLE for SSN: {}", maskSsn(ssn));
            throw new RuntimeException("External Credit Bureau API Connection Timeout (503)");
        }

        // Generate score between 500 and 850 based on SSN hash for deterministic testing
        int baseScore = 600 + Math.abs(ssn.hashCode() % 250);
        return Math.min(850, Math.max(300, baseScore));
    }

    private String maskSsn(String ssn) {
        if (ssn == null || ssn.length() < 4) return "***";
        return "***-**-" + ssn.substring(ssn.length() - 4);
    }
}
