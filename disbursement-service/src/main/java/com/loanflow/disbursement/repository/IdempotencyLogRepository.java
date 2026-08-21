package com.loanflow.disbursement.repository;

import com.loanflow.disbursement.entity.IdempotencyLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface IdempotencyLogRepository extends JpaRepository<IdempotencyLog, Long> {
    Optional<IdempotencyLog> findByIdempotencyKey(String idempotencyKey);
    boolean existsByIdempotencyKey(String idempotencyKey);
}
