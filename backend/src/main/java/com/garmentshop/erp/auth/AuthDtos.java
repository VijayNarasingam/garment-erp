package com.garmentshop.erp.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record LoginRequest(
            @NotBlank(message = "Username is required") String username,
            @NotBlank(message = "Password is required") String password
    ) {
    }

    public record BranchInfo(Long id, String code, String name, String address, String city, String stateCode,
                             String gstin, String invoicePrefix, boolean primaryBranch) {
    }

    public record UserInfo(Long id, String username, String fullName, String email, String phone,
                           List<String> roles, List<String> permissions, List<BranchInfo> branches,
                           Long defaultBranchId, BigDecimal discountLimitPercent, Long businessId) {
    }

    public record BusinessInfo(Long id, String name, String legalName, String gstin, String stateCode,
                               String address, String phone, String email, boolean gstEnabled, String currency,
                               String invoicePrefix, boolean roundOffEnabled, boolean defaultTaxInclusive,
                               int returnWindowDays, int exchangeWindowDays, boolean returnApprovalRequired,
                               boolean refundToOriginalMethodOnly, boolean allowNegativeStockWithApproval,
                               String costingMethod, int financialYearStartMonth, String thankYouNote,
                               boolean receiptShowCustomer, boolean receiptShowCashier,
                               boolean receiptShowPayment, boolean receiptShowUpiQr,
                               boolean receiptShowTerms, boolean receiptShowSku,
                               boolean receiptShowSizeColor, boolean receiptShowHsn,
                               boolean receiptShowItemRate, boolean receiptShowItemDiscount,
                               String receiptTerms, String upiId, String upiPayeeName) {
    }

    public record LoginResponse(String token, long expiresIn, UserInfo user, BusinessInfo business) {
    }

    public record ChangePasswordRequest(
            @NotBlank(message = "Current password is required") String currentPassword,
            @NotBlank(message = "New password is required")
            @Size(min = 8, max = 100, message = "Password must be 8-100 characters") String newPassword
    ) {
    }

    public record SetPinRequest(
            @NotBlank(message = "PIN is required")
            @Pattern(regexp = "\\d{4,6}", message = "PIN must be 4-6 digits") String pin
    ) {
    }

    public record PermissionInfo(Long id, String code, String module, String description) {
    }
}
