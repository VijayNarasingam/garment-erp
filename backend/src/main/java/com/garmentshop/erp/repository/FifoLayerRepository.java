package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.FifoLayer;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FifoLayerRepository extends JpaRepository<FifoLayer, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select l from FifoLayer l
            where l.branch.id = :branchId and l.variant.id = :variantId and l.quantityRemaining > 0
            order by l.receivedAt asc, l.id asc
            """)
    List<FifoLayer> findOpenLayersForUpdate(@Param("branchId") Long branchId, @Param("variantId") Long variantId);

    @Query("""
            select coalesce(sum(l.quantityRemaining * l.unitCost), 0) from FifoLayer l
            where (:branchId is null or l.branch.id = :branchId)
            """)
    java.math.BigDecimal inventoryValue(@Param("branchId") Long branchId);
}
