package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.InvoiceSequence;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface InvoiceSequenceRepository extends JpaRepository<InvoiceSequence, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from InvoiceSequence s where s.branch.id = :branchId and s.financialYear = :financialYear")
    Optional<InvoiceSequence> findForUpdate(@Param("branchId") Long branchId, @Param("financialYear") String financialYear);

    Optional<InvoiceSequence> findByBranchIdAndFinancialYear(Long branchId, String financialYear);
}
