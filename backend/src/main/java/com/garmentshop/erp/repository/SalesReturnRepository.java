package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.ReturnStatus;
import com.garmentshop.erp.domain.SalesReturn;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface SalesReturnRepository extends JpaRepository<SalesReturn, Long> {

    Optional<SalesReturn> findByIdAndBusinessId(Long id, Long businessId);

    Optional<SalesReturn> findByOfflineId(String offlineId);

    boolean existsByOfflineId(String offlineId);

    List<SalesReturn> findByBusinessIdOrderByIdDesc(Long businessId);

    long countByBusinessIdAndStatus(Long businessId, ReturnStatus status);

    @Query("""
            select r from SalesReturn r
            where r.customer.id = :customerId and r.status = 'COMPLETED'
            order by r.returnDate asc, r.id asc
            """)
    List<SalesReturn> findByCustomer(@Param("customerId") Long customerId);

    @Query("""
            select coalesce(sum(r.total), 0) from SalesReturn r
            where r.businessId = :businessId and r.status = 'COMPLETED'
              and (:branchId is null or r.branch.id = :branchId)
              and r.returnDate between :from and :to
            """)
    BigDecimal sumReturns(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                          @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select r from SalesReturn r
            where r.businessId = :businessId
              and (:branchId is null or r.branch.id = :branchId)
              and r.returnDate between :from and :to
            order by r.id desc
            """)
    List<SalesReturn> findForPeriod(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                    @Param("from") LocalDate from, @Param("to") LocalDate to);
}
