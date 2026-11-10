package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Payment;
import com.garmentshop.erp.domain.PaymentMethod;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByOfflineId(String offlineId);

    boolean existsByOfflineId(String offlineId);

    List<Payment> findByInvoiceIdAndStatusOrderByIdAsc(Long invoiceId, String status);

    @Query("""
            select distinct p.method from Payment p
            where p.invoice.id = :invoiceId and p.status = 'POSTED'
              and p.type = com.garmentshop.erp.domain.PaymentType.CUSTOMER_RECEIPT
              and p.method <> com.garmentshop.erp.domain.PaymentMethod.EXCHANGE
            """)
    List<PaymentMethod> findOriginalReceiptMethods(@Param("invoiceId") Long invoiceId);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.invoice.id = :invoiceId and p.status = 'POSTED'
              and p.type = com.garmentshop.erp.domain.PaymentType.CUSTOMER_REFUND
            """)
    BigDecimal sumRefundsForInvoice(@Param("invoiceId") Long invoiceId);

    List<Payment> findByCustomerIdOrderByPaymentDateDescIdDesc(Long customerId);

    @Query("""
            select p.method, coalesce(sum(p.amount), 0) from Payment p
            where p.businessId = :businessId and p.status = 'POSTED'
              and (:branchId is null or p.branch.id = :branchId)
              and p.paymentDate between :from and :to
              and p.type in (com.garmentshop.erp.domain.PaymentType.CUSTOMER_RECEIPT,
                             com.garmentshop.erp.domain.PaymentType.CUSTOMER_REFUND)
            group by p.method
            """)
    List<Object[]> collectionByMethod(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                      @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.businessId = :businessId and p.status = 'POSTED'
              and p.type = :type
              and (:branchId is null or p.branch.id = :branchId)
              and p.paymentDate between :from and :to
            """)
    BigDecimal sumByType(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                         @Param("type") com.garmentshop.erp.domain.PaymentType type,
                         @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.cashSessionId = :sessionId and p.status = 'POSTED'
              and p.type = :type and p.method = :method
            """)
    BigDecimal sumBySessionAndTypeAndMethod(@Param("sessionId") Long sessionId,
                                            @Param("type") com.garmentshop.erp.domain.PaymentType type,
                                            @Param("method") com.garmentshop.erp.domain.PaymentMethod method);

    List<Payment> findByCashSessionIdOrderByIdAsc(Long cashSessionId);

    @Query("""
            select p.method, p.type, coalesce(sum(p.amount), 0), count(p) from Payment p
            where p.cashSessionId = :sessionId and p.status = 'POSTED'
            group by p.method, p.type
            """)
    List<Object[]> totalsBySession(@Param("sessionId") Long sessionId);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.businessId = :businessId and p.status = 'POSTED'
              and (:branchId is null or p.branch.id = :branchId)
              and p.paymentDate between :from and :to
              and p.type = :type and p.method = :method
            """)
    BigDecimal sumByTypeAndMethodForPeriod(@Param("businessId") Long businessId,
                                           @Param("branchId") Long branchId,
                                           @Param("type") com.garmentshop.erp.domain.PaymentType type,
                                           @Param("method") com.garmentshop.erp.domain.PaymentMethod method,
                                           @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.businessId = :businessId and p.status = 'POSTED'
              and (:branchId is null or p.branch.id = :branchId)
              and p.paymentDate between :from and :to
              and p.type = com.garmentshop.erp.domain.PaymentType.CUSTOMER_RECEIPT
              and p.method = com.garmentshop.erp.domain.PaymentMethod.CASH
            """)
    BigDecimal cashCollectedForPeriod(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                      @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select p from Payment p
            where p.businessId = :businessId
              and (:branchId is null or p.branch.id = :branchId)
              and p.paymentDate between :from and :to
            order by p.id desc
            """)
    List<Payment> findForPeriod(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.businessId = :businessId and p.status = 'POSTED'
              and p.customer.id = :customerId
              and p.type = com.garmentshop.erp.domain.PaymentType.CUSTOMER_RECEIPT
            """)
    BigDecimal totalReceivedFromCustomer(@Param("businessId") Long businessId, @Param("customerId") Long customerId);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.businessId = :businessId and p.status = 'POSTED'
              and p.customer.id = :customerId
              and p.invoice is null
              and p.type = com.garmentshop.erp.domain.PaymentType.CUSTOMER_RECEIPT
            """)
    BigDecimal advanceReceipts(@Param("businessId") Long businessId, @Param("customerId") Long customerId);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.businessId = :businessId and p.status = 'POSTED'
              and p.customer.id = :customerId
              and p.invoice is not null
              and p.method = com.garmentshop.erp.domain.PaymentMethod.ADVANCE
              and p.type = com.garmentshop.erp.domain.PaymentType.CUSTOMER_RECEIPT
            """)
    BigDecimal advancesApplied(@Param("businessId") Long businessId, @Param("customerId") Long customerId);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.businessId = :businessId and p.status = 'POSTED'
              and p.customer.id = :customerId
              and p.method = com.garmentshop.erp.domain.PaymentMethod.ADVANCE
              and p.type = com.garmentshop.erp.domain.PaymentType.CUSTOMER_REFUND
            """)
    BigDecimal advancesRestored(@Param("businessId") Long businessId, @Param("customerId") Long customerId);
}
