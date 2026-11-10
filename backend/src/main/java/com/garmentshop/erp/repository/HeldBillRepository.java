package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.HeldBill;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface HeldBillRepository extends JpaRepository<HeldBill, Long> {
    List<HeldBill> findByBranchIdOrderByIdDesc(Long branchId);
}
