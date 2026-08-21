package com.loanflow.credit.repository;

import com.loanflow.credit.entity.CreditReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CreditReportRepository extends JpaRepository<CreditReport, Long> {
    Optional<CreditReport> findByApplicationId(Long applicationId);
}
