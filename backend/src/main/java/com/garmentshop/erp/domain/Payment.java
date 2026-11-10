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
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "payments",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_payment_business_no", columnNames = {"business_id", "payment_no"}),
                @UniqueConstraint(name = "uk_payment_offline_id", columnNames = {"offline_id"})
        },
        indexes = {
                @Index(name = "idx_payment_date", columnList = "business_id,payment_date"),
                @Index(name = "idx_payment_customer", columnList = "customer_id")
        })
@Getter
@Setter
@NoArgsConstructor
public class Payment extends BaseEntity {

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @Column(name = "payment_no", nullable = false, length = 50)
    private String paymentNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PaymentType type;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id")
    private Invoice invoice;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private BankAccount bankAccount;

    @Column(name = "payment_date", nullable = false)
    private LocalDate paymentDate = LocalDate.now();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentMethod method;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(length = 100)
    private String reference;

    @Column(length = 500)
    private String notes;

    @Column(nullable = false, length = 20)
    private String status = "POSTED";

    private Long cashSessionId;

    @Column(nullable = false)
    private Long createdBy;

    @Column(length = 120)
    private String createdByName;

    @Column(length = 80)
    private String deviceId;

    @Column(name = "offline_id", length = 80)
    private String offlineId;

    private Long journalEntryId;

    private Instant postedAt;

    private Long returnId;

    @Column(nullable = false, length = 20)
    private String source = "ONLINE";
}
