package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.CashSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CashSessionRepository extends JpaRepository<CashSession, Long> {

    Optional<CashSession> findFirstByBranchIdAndCashierIdAndStatusOrderByOpenedAtDesc(Long branchId, Long cashierId, com.garmentshop.erp.domain.CashSessionStatus status);

    Optional<CashSession> findFirstByBranchIdAndStatusOrderByOpenedAtDesc(Long branchId, com.garmentshop.erp.domain.CashSessionStatus status);

    Optional<CashSession> findByIdAndBusinessId(Long id, Long businessId);

    List<CashSession> findByBusinessIdOrderByOpenedAtDesc(Long businessId);

    List<CashSession> findByBranchIdOrderByOpenedAtDesc(Long branchId);
}
