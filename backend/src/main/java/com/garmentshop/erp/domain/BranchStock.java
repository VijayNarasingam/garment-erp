package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "branch_stock",
        uniqueConstraints = @UniqueConstraint(name = "uk_stock_branch_variant", columnNames = {"branch_id", "variant_id"}),
        indexes = @Index(name = "idx_stock_variant", columnList = "variant_id"))
@Getter
@Setter
@NoArgsConstructor
public class BranchStock extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "variant_id", nullable = false)
    private ProductVariant variant;

    @Column(nullable = false)
    private int quantity = 0;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal averageCost = BigDecimal.ZERO;

    private Instant lastMovementAt;
}
