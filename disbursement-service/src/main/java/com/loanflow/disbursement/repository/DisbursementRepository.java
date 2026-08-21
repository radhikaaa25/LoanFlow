package com.loanflow.disbursement.repository;

import com.loanflow.disbursement.entity.Disbursement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface DisbursementRepository extends JpaRepository<Disbursement, Long> {
    Optional<Disbursement> findByIdempotencyKey(String idempotencyKey);
    Optional<Disbursement> findByApplicationId(Long applicationId);
}
