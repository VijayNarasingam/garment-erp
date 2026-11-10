package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "cash_sessions", indexes = @Index(name = "idx_cash_session_branch", columnList = "branch_id,status"))
@Getter
@Setter
@NoArgsConstructor
public class CashSession extends BaseEntity {

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @Column(nullable = false)
    private Long cashierId;

    @Column(nullable = false, length = 120)
    private String cashierName;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal openingBalance = BigDecimal.ZERO;

    @Column(nullable = false)
    private Instant openedAt;

    private Instant closedAt;

    @Column(precision = 14, scale = 2)
    private BigDecimal expectedClosing;

    @Column(precision = 14, scale = 2)
    private BigDecimal actualClosing;

    @Column(precision = 14, scale = 2)
    private BigDecimal difference;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private CashSessionStatus status = CashSessionStatus.OPEN;

    private Long closedBy;

    private Long approvedBy;

    private Instant approvedAt;

    @Column(length = 500)
    private String notes;

    @Column(length = 500)
    private String discrepancyReason;
}
