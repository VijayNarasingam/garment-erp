package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.CashMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface CashMovementRepository extends JpaRepository<CashMovement, Long> {

    List<CashMovement> findByCashSessionIdOrderByIdAsc(Long cashSessionId);

    @Query("""
            select coalesce(sum(m.amount), 0) from CashMovement m
            where m.cashSession.id = :sessionId and m.type = :type
            """)
    BigDecimal sumBySessionAndType(@Param("sessionId") Long sessionId,
                                   @Param("type") com.garmentshop.erp.domain.CashMovementType type);
}
