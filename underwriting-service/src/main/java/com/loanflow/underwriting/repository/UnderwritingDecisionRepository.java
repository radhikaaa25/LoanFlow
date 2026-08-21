package com.loanflow.underwriting.repository;

import com.loanflow.underwriting.entity.UnderwritingDecision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UnderwritingDecisionRepository extends JpaRepository<UnderwritingDecision, Long> {
    Optional<UnderwritingDecision> findByApplicationId(Long applicationId);
}
