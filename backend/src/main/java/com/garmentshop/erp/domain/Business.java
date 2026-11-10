package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

@Entity
@Table(name = "businesses")
@Getter
@Setter
@NoArgsConstructor
public class Business extends BaseEntity {

    @Column(nullable = false, length = 150)
    private String name;

    @Column(length = 200)
    private String legalName;

    @Column(nullable = false, length = 3)
    private String currency = "INR";

    @Column(nullable = false)
    private boolean gstEnabled = false;

    @Column(length = 20)
    private String gstin;

    @Column(length = 10)
    private String stateCode;

    @Column(length = 300)
    private String address;

    @Column(length = 30)
    private String phone;

    @Column(length = 150)
    private String email;

    @Column(nullable = false)
    private int financialYearStartMonth = 4;

    @Column(nullable = false, length = 20)
    private String invoicePrefix = "INV";

    @Column(nullable = false)
    private boolean roundOffEnabled = true;

    @Column(nullable = false)
    private boolean defaultTaxInclusive = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CostingMethod costingMethod = CostingMethod.WEIGHTED_AVERAGE;

    @Column(nullable = false)
    private int returnWindowDays = 7;

    @Column(nullable = false)
    private int exchangeWindowDays = 15;

    @Column(nullable = false)
    private boolean returnApprovalRequired = true;

    @Column(nullable = false)
    private boolean refundToOriginalMethodOnly = true;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal maxDiscountPercent = BigDecimal.valueOf(50);

    @Column(nullable = false)
    private boolean allowNegativeStockWithApproval = true;

    @Column(nullable = false, length = 60)
    private String timezone = "Asia/Kolkata";

    /** Closing line printed at the bottom of every bill. Customisable from Settings. */
    @Column(nullable = false, length = 200,
            columnDefinition = "varchar(200) default 'Thank you for shopping with us!'")
    private String thankYouNote = DEFAULT_THANK_YOU_NOTE;

    @Column(columnDefinition = "TEXT")
    private String settingsJson;

    public static final String DEFAULT_THANK_YOU_NOTE = "Thank you for shopping with us!";
}
