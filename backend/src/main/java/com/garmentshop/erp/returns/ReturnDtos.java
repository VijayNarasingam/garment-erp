package com.garmentshop.erp.returns;

import jakarta.validation.Valid;
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

public final class ReturnDtos {

    private ReturnDtos() {
    }

    public record ReturnItemRequest(
            @NotNull Long invoiceItemId,
            @Min(1) int quantity,
            Boolean restockItem,
            @Size(max = 200) String conditionNote
    ) {
    }

    public record CreateReturnRequest(
            @NotNull Long branchId,
            @NotNull Long invoiceId,
            @NotBlank String type,
            LocalDate returnDate,
            @NotBlank @Size(max = 500) String reason,
            @Size(max = 300) String conditionNotes,
            Boolean restock,
            String refundMethod,
            @DecimalMin("0.0") BigDecimal refundAmount,
            @Size(max = 100) String refundReference,
            @Size(max = 80) String deviceId,
            @Size(max = 80) String offlineId,
            @NotEmpty @Valid List<ReturnItemRequest> items
    ) {
    }

    public record ApproveReturnRequest(@Size(max = 500) String notes) {
    }

    public record RejectReturnRequest(@NotBlank @Size(max = 300) String reason) {
    }

    public record CompleteReturnRequest(
            String refundMethod,
            @DecimalMin("0.0") BigDecimal refundAmount,
            @Size(max = 100) String refundReference
    ) {
    }

    public record CancelReturnRequest(@NotBlank @Size(max = 300) String reason) {
    }

    public record ReturnItemResponse(Long id, Long invoiceItemId, Long variantId, String productName, String sku,
                                     int quantity, BigDecimal unitPrice, BigDecimal taxRate,
                                     BigDecimal taxableAmount, BigDecimal taxAmount, BigDecimal lineTotal,
                                     BigDecimal costPrice, BigDecimal costAmount, boolean restockItem,
                                     String conditionNote) {
    }

    public record ReturnResponse(Long id, String returnNo, Long branchId, String branchName, Long invoiceId,
                                 String invoiceNo, Long customerId, String customerName, LocalDate returnDate,
                                 String type, String status, BigDecimal subtotal, BigDecimal taxTotal,
                                 BigDecimal total, BigDecimal refundAmount, BigDecimal costAmount, String reason,
                                 String conditionNotes, String refundMethod, String refundReference,
                                 Long exchangeInvoiceId, String requestedByName, String approvedByName,
                                 Instant approvedAt, String rejectionReason, Long journalEntryId,
                                 Long refundPaymentId, Instant completedAt, boolean restock, String source,
                                 String deviceId, String offlineId, Instant createdAt,
                                 List<ReturnItemResponse> items) {
    }
}
