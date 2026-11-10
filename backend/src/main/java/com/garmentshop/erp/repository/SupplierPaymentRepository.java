package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.SupplierPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface SupplierPaymentRepository extends JpaRepository<SupplierPayment, Long> {

    List<SupplierPayment> findByBusinessIdOrderByIdDesc(Long businessId);

    java.util.Optional<SupplierPayment> findByIdAndBusinessId(Long id, Long businessId);

    @Query("""
            select coalesce(sum(p.amount), 0) from SupplierPayment p
            where p.businessId = :businessId and p.status = 'POSTED'
              and (:branchId is null or p.branch.id = :branchId)
              and p.paymentDate between :from and :to
            """)
    BigDecimal sumPayments(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                           @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select p from SupplierPayment p
            where p.supplier.id = :supplierId and p.status = 'POSTED'
            order by p.paymentDate asc, p.id asc
            """)
    List<SupplierPayment> findBySupplier(@Param("supplierId") Long supplierId);
}
