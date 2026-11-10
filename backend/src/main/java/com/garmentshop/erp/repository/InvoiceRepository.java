package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Invoice;
import com.garmentshop.erp.domain.InvoiceStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {

    Optional<Invoice> findByIdAndBusinessId(Long id, Long businessId);

    Optional<Invoice> findByOfflineId(String offlineId);

    boolean existsByOfflineId(String offlineId);

    @Query(value = """
            select i from Invoice i
            where i.businessId = :businessId
              and (:branchId is null or i.branch.id = :branchId)
              and (:status is null or i.status = :status)
              and (:from is null or i.invoiceDate >= :from)
              and (:to is null or i.invoiceDate <= :to)
              and (:q is null or lower(i.invoiceNo) like lower(concat('%', :q, '%'))
                   or lower(i.customerName) like lower(concat('%', :q, '%'))
                   or i.customerPhone like concat('%', :q, '%'))
            order by i.invoiceDate desc, i.id desc
            """,
            countQuery = """
            select count(i) from Invoice i
            where i.businessId = :businessId
              and (:branchId is null or i.branch.id = :branchId)
              and (:status is null or i.status = :status)
              and (:from is null or i.invoiceDate >= :from)
              and (:to is null or i.invoiceDate <= :to)
              and (:q is null or lower(i.invoiceNo) like lower(concat('%', :q, '%'))
                   or lower(i.customerName) like lower(concat('%', :q, '%'))
                   or i.customerPhone like concat('%', :q, '%'))
            """)
    Page<Invoice> search(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                         @Param("status") InvoiceStatus status, @Param("from") LocalDate from, @Param("to") LocalDate to,
                         @Param("q") String q, Pageable pageable);

    @Query(value = """
            select coalesce(sum(i.total), 0) from Invoice i
            where i.businessId = :businessId and i.status = 'POSTED'
              and (:branchId is null or i.branch.id = :branchId)
              and i.invoiceDate between :from and :to
            """)
    BigDecimal sumSales(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                        @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = """
            select coalesce(sum(i.taxTotal), 0) from Invoice i
            where i.businessId = :businessId and i.status = 'POSTED'
              and (:branchId is null or i.branch.id = :branchId)
              and i.invoiceDate between :from and :to
            """)
    BigDecimal sumTax(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                      @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = """
            select coalesce(sum(i.costOfGoods), 0) from Invoice i
            where i.businessId = :businessId and i.status = 'POSTED'
              and (:branchId is null or i.branch.id = :branchId)
              and i.invoiceDate between :from and :to
            """)
    BigDecimal sumCost(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                       @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = """
            select coalesce(sum(i.balanceAmount), 0) from Invoice i
            where i.businessId = :businessId and i.status = 'POSTED'
              and (:branchId is null or i.branch.id = :branchId)
              and i.balanceAmount > 0
            """)
    BigDecimal outstandingReceivables(@Param("businessId") Long businessId, @Param("branchId") Long branchId);

    long countByBusinessIdAndStatusAndInvoiceDateBetween(Long businessId, InvoiceStatus status, LocalDate from, LocalDate to);

    long countByBusinessIdAndBranchIdAndStatusAndInvoiceDateBetween(Long businessId, Long branchId,
                                                                   InvoiceStatus status, LocalDate from, LocalDate to);

    @Query(value = """
            select i.invoiceDate, coalesce(sum(i.total), 0), count(i) from Invoice i
            where i.businessId = :businessId and i.status = 'POSTED'
              and (:branchId is null or i.branch.id = :branchId)
              and i.invoiceDate between :from and :to
            group by i.invoiceDate order by i.invoiceDate
            """)
    List<Object[]> dailySales(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                              @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = """
            select i from Invoice i
            where i.businessId = :businessId
              and (:branchId is null or i.branch.id = :branchId)
              and (:from is null or i.invoiceDate >= :from)
              and (:to is null or i.invoiceDate <= :to)
            order by i.invoiceDate desc, i.id desc
            """)
    List<Invoice> findForPeriod(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = """
            select i from Invoice i where i.customer.id = :customerId
              and (:branchId is null or i.branch.id = :branchId)
            order by i.invoiceDate desc, i.id desc
            """)
    List<Invoice> findByCustomer(@Param("customerId") Long customerId, @Param("branchId") Long branchId);
}
