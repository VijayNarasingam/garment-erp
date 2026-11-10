package com.garmentshop.erp.purchasing;

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

public final class PurchaseDtos {

    private PurchaseDtos() {
    }

    public record OrderItemRequest(
            @NotNull Long variantId,
            @Min(1) int quantity,
            @NotNull @DecimalMin("0.0") BigDecimal unitCost,
            @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal taxRate
    ) {
    }

    public record CreateOrderRequest(
            @NotNull Long branchId,
            @NotNull Long supplierId,
            LocalDate orderDate,
            LocalDate expectedDate,
            @Size(max = 500) String notes,
            @NotEmpty @Valid List<OrderItemRequest> items
    ) {
    }

    public record OrderItemResponse(Long id, Long variantId, String productName, String sku, int quantityOrdered,
                                    int quantityReceived, BigDecimal unitCost, BigDecimal taxRate,
                                    BigDecimal lineTotal) {
    }

    public record OrderResponse(Long id, String orderNo, Long branchId, String branchName, Long supplierId,
                                String supplierName, String status, LocalDate orderDate, LocalDate expectedDate,
                                String notes, BigDecimal subtotal, BigDecimal taxTotal, BigDecimal total,
                                Instant createdAt, List<OrderItemResponse> items) {
    }

    public record InvoiceItemRequest(
            @NotNull Long variantId,
            @Min(1) int quantity,
            @NotNull @DecimalMin("0.0") BigDecimal unitCost,
            @DecimalMin("0.0") BigDecimal discountAmount,
            @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal taxRate,
            @Size(max = 20) String hsnCode
    ) {
    }

    public record CreateInvoiceRequest(
            @NotNull Long branchId,
            @NotNull Long supplierId,
            Long purchaseOrderId,
            @NotBlank @Size(max = 60) String supplierInvoiceNo,
            LocalDate invoiceDate,
            @Size(max = 500) String notes,
            @NotEmpty @Valid List<InvoiceItemRequest> items
    ) {
    }

    public record InvoiceItemResponse(Long id, Long variantId, String productName, String sku, int quantity,
                                      int returnedQuantity, BigDecimal unitCost, BigDecimal discountAmount,
                                      BigDecimal taxRate, BigDecimal taxAmount, BigDecimal lineTotal,
                                      String hsnCode) {
    }

    public record PurchaseInvoiceResponse(Long id, String internalNo, String supplierInvoiceNo,
                                          Long branchId, String branchName, Long supplierId, String supplierName,
                                          LocalDate invoiceDate, String status, BigDecimal subtotal,
                                          BigDecimal discountAmount, BigDecimal taxTotal, BigDecimal total,
                                          BigDecimal paidAmount, BigDecimal balance, String notes,
                                          Long purchaseOrderId, Long journalEntryId, Instant postedAt,
                                          List<InvoiceItemResponse> items) {
    }

    public record SupplierPaymentRequest(
            @NotNull Long branchId,
            @NotNull Long supplierId,
            Long purchaseInvoiceId,
            LocalDate paymentDate,
            @NotNull @DecimalMin("0.01") BigDecimal amount,
            @NotNull String method,
            @Size(max = 100) String reference,
            @Size(max = 500) String notes
    ) {
    }

    public record SupplierPaymentResponse(Long id, String paymentNo, Long supplierId, String supplierName,
                                          Long purchaseInvoiceId, LocalDate paymentDate, BigDecimal amount,
                                          String method, String reference, String status, Long journalEntryId,
                                          Instant postedAt) {
    }

    public record ReturnItemRequest(
            @NotNull Long variantId,
            @Min(1) int quantity,
            @NotNull @DecimalMin("0.0") BigDecimal unitCost,
            @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal taxRate
    ) {
    }

    public record CreateReturnRequest(
            @NotNull Long branchId,
            @NotNull Long supplierId,
            Long purchaseInvoiceId,
            LocalDate returnDate,
            @NotBlank @Size(max = 500) String reason,
            @NotEmpty @Valid List<ReturnItemRequest> items
    ) {
    }

    public record ReturnItemResponse(Long id, Long variantId, String productName, String sku, int quantity,
                                     BigDecimal unitCost, BigDecimal taxRate, BigDecimal taxAmount,
                                     BigDecimal lineTotal) {
    }

    public record PurchaseReturnResponse(Long id, String returnNo, Long branchId, String branchName,
                                         Long supplierId, String supplierName, Long purchaseInvoiceId,
                                         LocalDate returnDate, String reason, String status, BigDecimal subtotal,
                                         BigDecimal taxTotal, BigDecimal total, Long journalEntryId,
                                         List<ReturnItemResponse> items) {
    }
}
