package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "negative_stock_approvals")
@Getter
@Setter
@NoArgsConstructor
public class NegativeStockApproval extends BaseEntity {

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "variant_id", nullable = false)
    private ProductVariant variant;

    @Column(name = "invoice_id")
    private Long invoiceId;

    @Column(nullable = false)
    private Long requestedBy;

    @Column(nullable = false)
    private Long approvedBy;

    @Column(nullable = false, length = 60)
    private String approverUsername;

    @Column(nullable = false, length = 500)
    private String reason;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false, length = 80)
    private String deviceId;
}
