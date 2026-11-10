package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.PurchaseInvoice;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

public interface PurchaseInvoiceRepository extends JpaRepository<PurchaseInvoice, Long> {

    Optional<PurchaseInvoice> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsBySupplierIdAndSupplierInvoiceNoIgnoreCase(Long supplierId, String supplierInvoiceNo);

    @Query(value = """
            select p from PurchaseInvoice p
            where p.businessId = :businessId
              and (:branchId is null or p.branch.id = :branchId)
              and (:from is null or p.invoiceDate >= :from)
              and (:to is null or p.invoiceDate <= :to)
              and (:q is null or lower(p.internalNo) like lower(concat('%', :q, '%'))
                   or lower(p.supplierInvoiceNo) like lower(concat('%', :q, '%'))
                   or lower(p.supplier.name) like lower(concat('%', :q, '%')))
            order by p.invoiceDate desc, p.id desc
            """,
            countQuery = """
            select count(p) from PurchaseInvoice p
            where p.businessId = :businessId
              and (:branchId is null or p.branch.id = :branchId)
              and (:from is null or p.invoiceDate >= :from)
              and (:to is null or p.invoiceDate <= :to)
              and (:q is null or lower(p.internalNo) like lower(concat('%', :q, '%'))
                   or lower(p.supplierInvoiceNo) like lower(concat('%', :q, '%'))
                   or lower(p.supplier.name) like lower(concat('%', :q, '%')))
            """)
    Page<PurchaseInvoice> search(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                 @Param("from") LocalDate from, @Param("to") LocalDate to,
                                 @Param("q") String q, Pageable pageable);

    @Query("""
            select coalesce(sum(p.total), 0) from PurchaseInvoice p
            where p.businessId = :businessId and p.status = 'POSTED'
              and (:branchId is null or p.branch.id = :branchId)
              and p.invoiceDate between :from and :to
            """)
    BigDecimal sumPurchases(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                            @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(p.total - p.paidAmount), 0) from PurchaseInvoice p
            where p.businessId = :businessId and p.status = 'POSTED'
              and (:branchId is null or p.branch.id = :branchId)
            """)
    BigDecimal outstandingPayables(@Param("businessId") Long businessId, @Param("branchId") Long branchId);

    @Query("""
            select p from PurchaseInvoice p
            where p.supplier.id = :supplierId and p.status = 'POSTED'
            order by p.invoiceDate asc, p.id asc
            """)
    java.util.List<PurchaseInvoice> findBySupplier(@Param("supplierId") Long supplierId);
}
