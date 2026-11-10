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

@Entity
@Table(name = "product_variants",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_variant_business_sku", columnNames = {"business_id", "sku"}),
                @UniqueConstraint(name = "uk_variant_barcode", columnNames = {"barcode"})
        },
        indexes = {
                @Index(name = "idx_variant_product", columnList = "product_id"),
                @Index(name = "idx_variant_business_active", columnList = "business_id,active")
        })
@Getter
@Setter
@NoArgsConstructor
public class ProductVariant extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false, length = 60)
    private String sku;

    @Column(length = 30)
    private String barcode;

    @Column(length = 20)
    private String size;

    @Column(length = 40)
    private String color;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal purchasePrice = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal sellingPrice = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal mrp = BigDecimal.ZERO;

    @Column(nullable = false)
    private int reorderLevel = 5;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean barcodeInternal = true;
}
