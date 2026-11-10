package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.BranchStock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BranchStockRepository extends JpaRepository<BranchStock, Long> {

    Optional<BranchStock> findByBranchIdAndVariantId(Long branchId, Long variantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from BranchStock s where s.branch.id = :branchId and s.variant.id = :variantId")
    Optional<BranchStock> findForUpdate(@Param("branchId") Long branchId, @Param("variantId") Long variantId);

    @Query("""
            select s from BranchStock s
            join fetch s.variant v
            join fetch v.product p
            left join fetch p.taxCategory
            left join fetch p.brand
            where s.branch.id = :branchId and v.active = true and p.active = true
            order by p.name, v.size, v.color
            """)
    List<BranchStock> findForBranch(@Param("branchId") Long branchId);

    @Query("select coalesce(sum(s.quantity), 0) from BranchStock s where s.variant.id = :variantId")
    long totalQuantityForVariant(@Param("variantId") Long variantId);

    @Query("""
            select s from BranchStock s
            join fetch s.variant v
            join fetch v.product p
            where s.branch.id = :branchId and v.active = true and p.active = true
              and s.quantity <= v.reorderLevel
            order by s.quantity asc, p.name
            """)
    List<BranchStock> findLowStock(@Param("branchId") Long branchId);

    @Query("""
            select coalesce(sum(s.quantity * s.averageCost), 0) from BranchStock s
            where (:branchId is null or s.branch.id = :branchId)
            """)
    java.math.BigDecimal inventoryValue(@Param("branchId") Long branchId);

    @Query("select coalesce(sum(s.quantity), 0) from BranchStock s where (:branchId is null or s.branch.id = :branchId)")
    long totalQuantity(@Param("branchId") Long branchId);

    @Query("""
            select s from BranchStock s
            join fetch s.variant v
            join fetch v.product p
            join fetch s.branch b
            where v.business.id = :businessId
            order by b.name, p.name, v.size, v.color
            """)
    List<BranchStock> findAllForBusiness(@Param("businessId") Long businessId);

    @Query("""
            select s from BranchStock s join fetch s.variant v
            where s.branch.id = :branchId and s.updatedAt > :since
            order by s.variant.id
            """)
    List<BranchStock> findForSync(@Param("branchId") Long branchId, @Param("since") java.time.Instant since);
}
