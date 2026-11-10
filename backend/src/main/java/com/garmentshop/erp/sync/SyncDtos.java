package com.garmentshop.erp.sync;

import com.garmentshop.erp.sales.SaleDtos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class SyncDtos {

    private SyncDtos() {
    }

    public record RegisterDeviceRequest(
            @NotBlank @Size(max = 80) String deviceId,
            @NotNull Long branchId,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 30) String appVersion
    ) {
    }

    public record DeviceResponse(
            Long id,
            String deviceId,
            Long branchId,
            String branchName,
            String name,
            String appVersion,
            boolean active,
            Instant lastSyncAt,
            Instant lastSeenAt,
            Instant registeredAt
    ) {
    }

    public record StockSnapshot(
            @NotNull Long variantId,
            @NotNull @Min(0) Integer quantity
    ) {
    }

    public record SyncInvoiceItem(
            @NotBlank @Size(max = 80) String offlineId,
            @NotNull @Valid SaleDtos.CreateSaleRequest invoice,
            @Valid List<StockSnapshot> lastKnownStock
    ) {
    }

    public record SyncBatchRequest(
            @NotBlank @Size(max = 80) String batchId,
            @NotBlank @Size(max = 80) String deviceId,
            @NotNull Long branchId,
            @NotEmpty @Size(max = 100) @Valid List<SyncInvoiceItem> invoices
    ) {
    }

    public record StockConflict(
            Long variantId,
            Integer lastKnownQuantity,
            Integer requestedQuantity,
            Integer currentQuantity
    ) {
    }

    public record SyncItemResult(
            String offlineId,
            String status,
            Long invoiceId,
            String invoiceNo,
            String code,
            String message,
            List<StockConflict> conflicts
    ) {
    }

    public record SyncBatchResponse(
            String batchId,
            String status,
            int itemCount,
            int acceptedCount,
            int duplicateCount,
            int conflictCount,
            int rejectedCount,
            Instant processedAt,
            List<SyncItemResult> items
    ) {
    }

    public record SyncBatchSummary(
            Long id,
            String batchId,
            Long branchId,
            String branchName,
            String deviceId,
            String status,
            int itemCount,
            int acceptedCount,
            int duplicateCount,
            int conflictCount,
            int rejectedCount,
            Instant processedAt
    ) {
    }

    public record BusinessSnapshot(
            Long id,
            String name,
            String currency,
            boolean gstEnabled,
            String gstin,
            String stateCode,
            boolean defaultTaxInclusive,
            boolean roundOffEnabled,
            String invoicePrefix,
            int financialYearStartMonth,
            BigDecimal maxDiscountPercent,
            boolean allowNegativeStockWithApproval,
            int returnWindowDays,
            int exchangeWindowDays,
            String timezone
    ) {
    }

    public record BranchSnapshot(
            Long id,
            String code,
            String name,
            String address,
            String city,
            String state,
            String stateCode,
            String gstin,
            String phone,
            String invoicePrefix
    ) {
    }

    public record VariantSnapshot(
            Long id,
            Long productId,
            String productCode,
            String productName,
            String categoryName,
            String brandName,
            String sku,
            String barcode,
            String size,
            String color,
            BigDecimal purchasePrice,
            BigDecimal sellingPrice,
            BigDecimal mrp,
            int reorderLevel,
            boolean active,
            String hsnCode,
            Long taxCategoryId,
            BigDecimal taxRate,
            boolean taxInclusive,
            Instant updatedAt
    ) {
    }

    public record StockSnapshotResponse(
            Long variantId,
            String sku,
            int quantity,
            BigDecimal averageCost,
            Instant lastMovementAt,
            Instant updatedAt
    ) {
    }

    public record CustomerSnapshot(
            Long id,
            String code,
            String name,
            String phone,
            String email,
            String gstin,
            String address,
            String city,
            String state,
            String stateCode,
            BigDecimal creditLimit,
            BigDecimal discountPercent,
            boolean active,
            Instant updatedAt
    ) {
    }

    public record TaxCategorySnapshot(
            Long id,
            String name,
            String hsnCode,
            BigDecimal gstRate,
            BigDecimal cgstRate,
            BigDecimal sgstRate,
            BigDecimal igstRate,
            boolean exempt,
            boolean taxInclusive,
            boolean active,
            Instant updatedAt
    ) {
    }

    public record PullResponse(
            Instant serverTime,
            Instant since,
            BusinessSnapshot business,
            BranchSnapshot branch,
            List<VariantSnapshot> variants,
            List<StockSnapshotResponse> stock,
            List<CustomerSnapshot> customers,
            List<TaxCategorySnapshot> taxCategories
    ) {
    }
}
