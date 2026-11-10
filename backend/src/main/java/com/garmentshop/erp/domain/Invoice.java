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
@Table(name = "invoices",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_invoice_branch_no", columnNames = {"branch_id", "invoice_no"}),
                @UniqueConstraint(name = "uk_invoice_offline_id", columnNames = {"offline_id"})
        },
        indexes = {
                @Index(name = "idx_invoice_business_date", columnList = "business_id,invoice_date"),
                @Index(name = "idx_invoice_branch_date", columnList = "branch_id,invoice_date"),
                @Index(name = "idx_invoice_customer", columnList = "customer_id"),
                @Index(name = "idx_invoice_status", columnList = "status")
        })
@Getter
@Setter
@NoArgsConstructor
public class Invoice extends BaseEntity {

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @Column(name = "invoice_no", nullable = false, length = 60)
    private String invoiceNo;

    @Column(name = "financial_year", nullable = false, length = 12)
    private String financialYear;

    @Column(name = "invoice_date", nullable = false)
    private LocalDate invoiceDate = LocalDate.now();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InvoiceStatus status = InvoiceStatus.POSTED;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @Column(length = 150)
    private String customerName;

    @Column(length = 30)
    private String customerPhone;

    @Column(length = 20)
    private String customerGstin;

    @Column(length = 10)
    private String placeOfSupplyStateCode;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal subtotal = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal itemDiscount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal billDiscount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal additionalCharges = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal taxableAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal taxTotal = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal roundOff = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal total = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal paidAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal balanceAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal costOfGoods = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal grossProfit = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean gstEnabled = false;

    @Column(nullable = false)
    private boolean taxInclusive = false;

    @Column(length = 500)
    private String notes;

    private Long originalInvoiceId;

    @Column(length = 300)
    private String amendmentReason;

    @Column(nullable = false)
    private Long createdBy;

    @Column(length = 120)
    private String createdByName;

    @Column(length = 80)
    private String deviceId;

    @Column(name = "offline_id", length = 80)
    private String offlineId;

    @Column(length = 80)
    private String clientInvoiceRef;

    @Column(nullable = false, length = 20)
    private String source = "ONLINE";

    private Long journalEntryId;

    private Long costJournalEntryId;

    private Instant postedAt;

    private Instant cancelledAt;

    private Long cancelledBy;

    @Column(length = 300)
    private String cancelReason;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<InvoiceItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<InvoiceCharge> charges = new ArrayList<>();
}
