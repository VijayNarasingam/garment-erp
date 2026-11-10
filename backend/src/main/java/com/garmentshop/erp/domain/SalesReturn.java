package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "sales_returns",
        uniqueConstraints = @UniqueConstraint(name = "uk_return_business_no", columnNames = {"business_id", "return_no"}),
        indexes = @Index(name = "idx_return_date", columnList = "business_id,return_date"))
@Getter
@Setter
@NoArgsConstructor
public class SalesReturn extends BaseEntity {

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @Column(name = "return_no", nullable = false, length = 50)
    private String returnNo;

    @Column(name = "return_date", nullable = false)
    private LocalDate returnDate = LocalDate.now();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReturnType type = ReturnType.RETURN;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReturnStatus status = ReturnStatus.PENDING;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal subtotal = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal taxTotal = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal total = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal refundAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal costAmount = BigDecimal.ZERO;

    @Column(nullable = false, length = 500)
    private String reason;

    @Column(length = 300)
    private String conditionNotes;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private PaymentMethod refundMethod;

    @Column(length = 100)
    private String refundReference;

    private Long exchangeInvoiceId;

    @Column(nullable = false)
    private Long requestedBy;

    @Column(length = 120)
    private String requestedByName;

    private Long approvedBy;

    @Column(length = 120)
    private String approvedByName;

    private Instant approvedAt;

    @Column(length = 300)
    private String rejectionReason;

    private Long journalEntryId;

    private Long refundPaymentId;

    private Instant completedAt;

    @Column(nullable = false)
    private boolean restock = true;

    @Column(nullable = false, length = 20)
    private String source = "ONLINE";

    @Column(length = 80)
    private String deviceId;

    @Column(length = 80)
    private String offlineId;

    @OneToMany(mappedBy = "salesReturn", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SalesReturnItem> items = new ArrayList<>();
}
