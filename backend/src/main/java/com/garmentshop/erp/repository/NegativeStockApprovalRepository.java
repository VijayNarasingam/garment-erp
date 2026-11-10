package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.NegativeStockApproval;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NegativeStockApprovalRepository extends JpaRepository<NegativeStockApproval, Long> {
}
