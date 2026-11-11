package com.garmentshop.erp.business;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public final class BusinessDtos {

    private BusinessDtos() {
    }

    public record BusinessResponse(Long id, String name, String legalName, String currency, boolean gstEnabled,
                                   String gstin, String stateCode, String address, String phone, String email,
                                   int financialYearStartMonth, String invoicePrefix, boolean roundOffEnabled,
                                   boolean defaultTaxInclusive, String costingMethod, int returnWindowDays,
                                   int exchangeWindowDays, boolean returnApprovalRequired,
                                   boolean refundToOriginalMethodOnly, BigDecimal maxDiscountPercent,
                                   boolean allowNegativeStockWithApproval, String timezone, String thankYouNote,
                                   boolean receiptShowCustomer, boolean receiptShowCashier,
                                   boolean receiptShowPayment, boolean receiptShowUpiQr,
                                   boolean receiptShowTerms, boolean receiptShowSku,
                                   boolean receiptShowSizeColor, boolean receiptShowHsn,
                                   boolean receiptShowItemRate, boolean receiptShowItemDiscount,
                                   String receiptTerms, String upiId, String upiPayeeName) {
    }

    public record UpdateBusinessRequest(
            @NotBlank @Size(max = 150) String name,
            @Size(max = 200) String legalName,
            boolean gstEnabled,
            @Size(max = 20) String gstin,
            @Size(max = 10) String stateCode,
            @Size(max = 300) String address,
            @Size(max = 30) String phone,
            @Email @Size(max = 150) String email,
            @Min(1) @Max(12) int financialYearStartMonth,
            @NotBlank @Size(max = 20) String invoicePrefix,
            boolean roundOffEnabled,
            boolean defaultTaxInclusive,
            @Min(0) @Max(365) int returnWindowDays,
            @Min(0) @Max(365) int exchangeWindowDays,
            boolean returnApprovalRequired,
            boolean refundToOriginalMethodOnly,
            @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal maxDiscountPercent,
            boolean allowNegativeStockWithApproval,
            @Size(max = 60) String timezone,
            @Size(max = 200) String thankYouNote,
            boolean receiptShowCustomer,
            boolean receiptShowCashier,
            boolean receiptShowPayment,
            boolean receiptShowUpiQr,
            boolean receiptShowTerms,
            boolean receiptShowSku,
            boolean receiptShowSizeColor,
            boolean receiptShowHsn,
            boolean receiptShowItemRate,
            boolean receiptShowItemDiscount,
            @Size(max = 500) String receiptTerms,
            @Size(max = 100)
            @Pattern(regexp = "^$|^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$",
                    message = "UPI ID must look like shop@bank") String upiId,
            @Size(max = 150) String upiPayeeName
    ) {
    }
}
