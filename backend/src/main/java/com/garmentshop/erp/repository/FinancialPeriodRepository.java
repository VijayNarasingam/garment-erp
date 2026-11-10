package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.FinancialPeriod;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface FinancialPeriodRepository extends JpaRepository<FinancialPeriod, Long> {

    List<FinancialPeriod> findByBusinessIdOrderByStartDateDesc(Long businessId);

    Optional<FinancialPeriod> findByIdAndBusinessId(Long id, Long businessId);

    @Query("""
            select p from FinancialPeriod p
            where p.business.id = :businessId and :date between p.startDate and p.endDate
            """)
    Optional<FinancialPeriod> findContaining(@Param("businessId") Long businessId, @Param("date") LocalDate date);

    boolean existsByBusinessIdAndStartDateLessThanEqualAndEndDateGreaterThanEqual(Long businessId, LocalDate start, LocalDate end);
}
