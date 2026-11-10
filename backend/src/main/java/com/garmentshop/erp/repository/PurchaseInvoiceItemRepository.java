package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.PurchaseInvoiceItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface PurchaseInvoiceItemRepository extends JpaRepository<PurchaseInvoiceItem, Long> {

    @Query("""
            select i.taxRate, sum(i.lineTotal - i.taxAmount), sum(i.taxAmount), sum(i.quantity)
            from PurchaseInvoiceItem i
            where i.purchaseInvoice.businessId = :businessId
              and i.purchaseInvoice.status = com.garmentshop.erp.domain.PurchaseInvoiceStatus.POSTED
              and (:branchId is null or i.purchaseInvoice.branch.id = :branchId)
              and i.purchaseInvoice.invoiceDate between :from and :to
            group by i.taxRate order by i.taxRate
            """)
    List<Object[]> gstSummary(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                              @Param("from") LocalDate from, @Param("to") LocalDate to);
}
