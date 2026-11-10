package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Expense;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ExpenseRepository extends JpaRepository<Expense, Long> {

    Optional<Expense> findByIdAndBusinessId(Long id, Long businessId);

    long countByBusinessIdAndStatus(Long businessId, com.garmentshop.erp.domain.ExpenseStatus status);

    @Query(value = """
            select e from Expense e
            where e.businessId = :businessId
              and (:branchId is null or e.branch.id = :branchId)
              and (:status is null or e.status = :status)
              and (:from is null or e.expenseDate >= :from)
              and (:to is null or e.expenseDate <= :to)
            order by e.expenseDate desc, e.id desc
            """,
            countQuery = """
            select count(e) from Expense e
            where e.businessId = :businessId
              and (:branchId is null or e.branch.id = :branchId)
              and (:status is null or e.status = :status)
              and (:from is null or e.expenseDate >= :from)
              and (:to is null or e.expenseDate <= :to)
            """)
    Page<Expense> search(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                         @Param("status") com.garmentshop.erp.domain.ExpenseStatus status,
                         @Param("from") LocalDate from, @Param("to") LocalDate to, Pageable pageable);

    @Query("""
            select coalesce(sum(e.amount), 0) from Expense e
            where e.businessId = :businessId and e.status = 'POSTED'
              and (:branchId is null or e.branch.id = :branchId)
              and e.expenseDate between :from and :to
            """)
    BigDecimal sumExpenses(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                           @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select e.category.name, coalesce(sum(e.amount), 0) from Expense e
            where e.businessId = :businessId and e.status = 'POSTED'
              and (:branchId is null or e.branch.id = :branchId)
              and e.expenseDate between :from and :to
            group by e.category.name order by sum(e.amount) desc
            """)
    List<Object[]> byCategory(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                              @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(e.amount), 0) from Expense e
            where e.businessId = :businessId and e.status = 'POSTED'
              and e.paymentMethod = com.garmentshop.erp.domain.PaymentMethod.CASH
              and (:branchId is null or e.branch.id = :branchId)
              and e.expenseDate between :from and :to
            """)
    BigDecimal cashExpenses(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                            @Param("from") LocalDate from, @Param("to") LocalDate to);
}
