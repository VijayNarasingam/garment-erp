package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.PurchaseReturn;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PurchaseReturnRepository extends JpaRepository<PurchaseReturn, Long> {
    List<PurchaseReturn> findByBusinessIdOrderByIdDesc(Long businessId);

    java.util.Optional<PurchaseReturn> findByIdAndBusinessId(Long id, Long businessId);

    @Query("""
            select r from PurchaseReturn r
            where r.supplier.id = :supplierId and r.status = 'POSTED'
            order by r.returnDate asc, r.id asc
            """)
    List<PurchaseReturn> findBySupplier(@Param("supplierId") Long supplierId);
}
