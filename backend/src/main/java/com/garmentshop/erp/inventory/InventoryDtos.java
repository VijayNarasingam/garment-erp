package com.garmentshop.erp.inventory;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class InventoryDtos {

    private InventoryDtos() {
    }

    public record StockRow(Long variantId, Long productId, String productName, String sku, String barcode,
                           String size, String color, int quantity, BigDecimal averageCost, BigDecimal stockValue,
                           int reorderLevel, boolean lowStock, BigDecimal sellingPrice, BigDecimal mrp) {
    }

    public record StockSummary(Long branchId, long totalQuantity, BigDecimal totalValue, long lowStockCount,
                               long outOfStockCount) {
    }

    public record MovementResponse(Long id, LocalDate movementDate, String type, int quantity, int previousQuantity,
                                   int newQuantity, BigDecimal unitCost, BigDecimal totalCost, String reason,
                                   String referenceType, String referenceId, String username, Long variantId,
                                   String productName, String sku, String size, String color, Long branchId,
                                   String branchName) {
    }

    public record AdjustStockRequest(
            @NotNull Long branchId,
            @NotNull Long variantId,
            int quantityDelta,
            @DecimalMin("0.0") BigDecimal unitCost,
            @NotBlank @Size(max = 400) String reason,
            @Size(max = 30) String movementType,
            @Size(max = 60) String approverUsername,
            @Size(max = 20) String approverPin
    ) {
    }

    public record AdjustmentResponse(Long movementId, Long variantId, int previousQuantity, int newQuantity,
                                     BigDecimal unitCost, BigDecimal totalCost, boolean negativeStockApproved,
                                     String approvalNote) {
    }

    public record TransferItemRequest(@NotNull Long variantId, @Min(1) int quantity) {
    }

    public record CreateTransferRequest(
            @NotNull Long fromBranchId,
            @NotNull Long toBranchId,
            LocalDate transferDate,
            @Size(max = 500) String notes,
            @NotEmpty @Valid List<TransferItemRequest> items
    ) {
    }

    public record TransferItemResponse(Long variantId, String productName, String sku, int quantity,
                                       BigDecimal unitCost) {
    }

    public record TransferResponse(Long id, String transferNo, Long fromBranchId, String fromBranchName,
                                   Long toBranchId, String toBranchName, String status, LocalDate transferDate,
                                   String notes, List<TransferItemResponse> items, java.time.Instant completedAt) {
    }

    public record CostingChangeRequest(
            @NotNull String method,
            @NotNull LocalDate effectiveFrom,
            @Size(max = 500) String note,
            @Size(max = 60) String approverUsername,
            @Size(max = 20) String approverPin
    ) {
    }

    public record CostingConfigResponse(Long id, String method, LocalDate effectiveFrom, String note,
                                        BigDecimal revaluationAmount, java.time.Instant createdAt) {
    }

    public record RevaluationResponse(String previousMethod, String newMethod, BigDecimal previousValue,
                                      BigDecimal newValue, BigDecimal difference, Long journalEntryId) {
    }

    public record ValuationRow(Long branchId, String branchName, Long variantId, String productName, String sku,
                               int quantity, BigDecimal averageCost, BigDecimal stockValue) {
    }

    public record ValuationResponse(BigDecimal totalValue, long totalQuantity, List<ValuationRow> rows) {
    }

    public record VariantStock(Long variantId, Long productId, String productName, String sku, String barcode,
                               String size, String color, BigDecimal sellingPrice, BigDecimal mrp,
                               BigDecimal taxRate, boolean taxInclusive, long stockQuantity) {
    }
}
