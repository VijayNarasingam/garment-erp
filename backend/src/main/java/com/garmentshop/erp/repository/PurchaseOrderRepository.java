package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.PurchaseOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, Long> {

    List<PurchaseOrder> findByBusinessIdOrderByIdDesc(Long businessId);

    Optional<PurchaseOrder> findByIdAndBusinessId(Long id, Long businessId);

    List<PurchaseOrder> findByBusinessIdAndStatusOrderByIdDesc(Long businessId,
                                                               com.garmentshop.erp.domain.PurchaseOrderStatus status);
}
