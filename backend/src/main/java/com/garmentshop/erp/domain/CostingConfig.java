package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

@Entity
@Table(name = "costing_configs")
@Getter
@Setter
@NoArgsConstructor
public class CostingConfig extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private CostingMethod method;

    @Column(nullable = false)
    private LocalDate effectiveFrom;

    @Column(nullable = false)
    private Long createdBy;

    private Long approvedBy;

    @Column(length = 500)
    private String note;

    @Column(precision = 14, scale = 2)
    private java.math.BigDecimal revaluationAmount;
}
