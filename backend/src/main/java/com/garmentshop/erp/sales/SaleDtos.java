package com.garmentshop.erp.sales;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class SaleDtos {

    private SaleDtos() {
    }

    public record SaleItemRequest(
            @NotNull Long variantId,
            @Min(1) int quantity,
            @DecimalMin("0.0") BigDecimal unitPrice,
            @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal discountPercent,
            @DecimalMin("0.0") BigDecimal discountAmount
    ) {
    }

    public record SaleChargeRequest(
            @NotBlank @Size(max = 100) String name,
            @NotNull @DecimalMin("0.0") BigDecimal amount,
            boolean taxable,
            @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal taxRate
    ) {
    }

    public record SalePaymentRequest(
            @NotNull String method,
            @NotNull @DecimalMin("0.01") BigDecimal amount,
            @Size(max = 100) String reference,
            Long bankAccountId
    ) {
    }

    public record CreateSaleRequest(
            @NotNull Long branchId,
            Long customerId,
            LocalDate invoiceDate,
            @Size(max = 10) String placeOfSupplyStateCode,
            @Size(max = 500) String notes,
            @NotEmpty @Valid List<SaleItemRequest> items,
            @Valid List<SaleChargeRequest> charges,
            @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal billDiscountPercent,
            @DecimalMin("0.0") BigDecimal billDiscountAmount,
            @Valid List<SalePaymentRequest> payments,
            Long exchangeReturnId,
            @Size(max = 60) String approverUsername,
            @Size(max = 20) String approverPin,
            @Size(max = 80) String deviceId,
            @Size(max = 80) String offlineId,
            @Size(max = 80) String clientInvoiceRef
    ) {
    }

    public record AmendSaleRequest(@NotNull @Valid CreateSaleRequest sale, @NotBlank @Size(max = 300) String reason) {
    }

    public record CancelSaleRequest(@NotBlank @Size(max = 300) String reason) {
    }

    public record InvoiceItemResponse(Long id, Long variantId, String productName, String sku, String size,
                                      String color, String hsnCode, int quantity, BigDecimal unitPrice,
                                      BigDecimal mrp, BigDecimal discountPercent, BigDecimal discountAmount,
                                      BigDecimal taxRate, boolean taxInclusive, BigDecimal taxableAmount,
                                      BigDecimal taxAmount, BigDecimal lineTotal, BigDecimal costPrice,
                                      BigDecimal costAmount, int returnedQuantity) {
    }

    public record InvoiceChargeResponse(Long id, String name, BigDecimal amount, boolean taxable,
                                        BigDecimal taxRate, BigDecimal taxAmount) {
    }

    public record InvoicePaymentResponse(Long id, String paymentNo, String type, String method,
                                         BigDecimal amount, String reference, String status,
                                         Instant postedAt) {
    }

    public record InvoiceResponse(Long id, String invoiceNo, String financialYear, Long branchId,
                                  String branchName, LocalDate invoiceDate, String status, Long customerId,
                                  String customerName, String customerPhone, String customerGstin,
                                  String placeOfSupplyStateCode, BigDecimal subtotal, BigDecimal itemDiscount,
                                  BigDecimal billDiscount, BigDecimal additionalCharges, BigDecimal taxableAmount,
                                  BigDecimal taxTotal, BigDecimal roundOff, BigDecimal total, BigDecimal paidAmount,
                                  BigDecimal balanceAmount, BigDecimal costOfGoods, BigDecimal grossProfit,
                                  boolean gstEnabled, boolean taxInclusive, String notes, Long originalInvoiceId,
                                  String amendmentReason, String createdByName, String deviceId, String offlineId,
                                  String clientInvoiceRef, String source, Long journalEntryId,
                                  Long costJournalEntryId, Instant postedAt, Instant cancelledAt,
                                  String cancelReason, List<InvoiceItemResponse> items,
                                  List<InvoiceChargeResponse> charges, List<InvoicePaymentResponse> payments) {
    }

    public record HeldBillRequest(
            @NotNull Long branchId,
            @NotBlank @Size(max = 120) String label,
            Long customerId,
            @NotBlank String dataJson
    ) {
    }

    public record HeldBillResponse(Long id, Long branchId, String label, Long customerId, String dataJson,
                                   Long createdBy, Instant createdAt) {
    }

    public record SaleCalculation(Long subtotal, BigDecimal itemDiscount, BigDecimal billDiscount,
                                  BigDecimal additionalCharges, BigDecimal taxableAmount, BigDecimal taxTotal,
                                  BigDecimal roundOff, BigDecimal total) {
    }
}
