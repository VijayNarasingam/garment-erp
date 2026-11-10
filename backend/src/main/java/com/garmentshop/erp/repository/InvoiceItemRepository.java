package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.InvoiceItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface InvoiceItemRepository extends JpaRepository<InvoiceItem, Long> {

    @Query("""
            select i.variant.id, i.productName, i.sku, i.size, i.color, sum(i.quantity),
                   sum(i.lineTotal), sum(i.taxAmount), sum(i.costAmount)
            from InvoiceItem i
            where i.invoice.businessId = :businessId and i.invoice.status = 'POSTED'
              and (:branchId is null or i.invoice.branch.id = :branchId)
              and i.invoice.invoiceDate between :from and :to
            group by i.variant.id, i.productName, i.sku, i.size, i.color
            order by sum(i.quantity) desc
            """)
    List<Object[]> productSales(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(i.quantity), 0) from InvoiceItem i
            where i.invoice.businessId = :businessId and i.invoice.status = 'POSTED'
              and (:branchId is null or i.invoice.branch.id = :branchId)
              and i.invoice.invoiceDate between :from and :to
            """)
    long quantitySold(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                      @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select i.taxRate, sum(i.taxableAmount), sum(i.taxAmount), sum(i.lineTotal), sum(i.quantity)
            from InvoiceItem i
            where i.invoice.businessId = :businessId and i.invoice.status = 'POSTED'
              and (:branchId is null or i.invoice.branch.id = :branchId)
              and i.invoice.invoiceDate between :from and :to
            group by i.taxRate order by i.taxRate
            """)
    List<Object[]> gstSummary(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                              @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select i.hsnCode, i.taxRate, sum(i.quantity), sum(i.taxableAmount), sum(i.taxAmount), sum(i.lineTotal)
            from InvoiceItem i
            where i.invoice.businessId = :businessId and i.invoice.status = 'POSTED'
              and (:branchId is null or i.invoice.branch.id = :branchId)
              and i.invoice.invoiceDate between :from and :to
            group by i.hsnCode, i.taxRate order by i.hsnCode
            """)
    List<Object[]> hsnSummary(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                              @Param("from") LocalDate from, @Param("to") LocalDate to);
}
