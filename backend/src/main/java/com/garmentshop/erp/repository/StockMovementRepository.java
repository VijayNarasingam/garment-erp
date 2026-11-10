package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.StockMovement;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {

    @Query("""
            select m from StockMovement m
            join fetch m.variant v
            join fetch v.product p
            where m.businessId = :businessId
              and (:branchId is null or m.branch.id = :branchId)
              and (:variantId is null or v.id = :variantId)
              and (:from is null or m.movementDate >= :from)
              and (:to is null or m.movementDate <= :to)
            order by m.id desc
            """)
    Page<StockMovement> search(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                               @Param("variantId") Long variantId, @Param("from") LocalDate from,
                               @Param("to") LocalDate to, Pageable pageable);

    @Query("""
            select m from StockMovement m join fetch m.variant v join fetch v.product p
            where m.businessId = :businessId and m.movementDate between :from and :to
            order by m.id asc
            """)
    List<StockMovement> findForPeriod(@Param("businessId") Long businessId, @Param("from") LocalDate from,
                                      @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(m.quantity), 0) from StockMovement m
            where m.branch.id = :branchId and m.variant.id = :variantId
              and m.movementDate <= :date
            """)
    long quantityAsOf(@Param("branchId") Long branchId, @Param("variantId") Long variantId, @Param("date") LocalDate date);
}
