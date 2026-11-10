package com.garmentshop.erp.catalog;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public final class CatalogDtos {

    private CatalogDtos() {
    }

    public record CategoryResponse(Long id, String name, String description, boolean active) {
    }

    public record SaveCategoryRequest(@NotBlank @Size(max = 100) String name,
                                      @Size(max = 300) String description,
                                      boolean active) {
    }

    public record BrandResponse(Long id, String name, String description, boolean active) {
    }

    public record SaveBrandRequest(@NotBlank @Size(max = 100) String name,
                                   @Size(max = 300) String description,
                                   boolean active) {
    }

    public record TaxCategoryResponse(Long id, String name, String hsnCode, BigDecimal gstRate,
                                      BigDecimal cgstRate, BigDecimal sgstRate, BigDecimal igstRate,
                                      boolean exempt, Boolean taxInclusive, boolean active) {
    }

    public record SaveTaxCategoryRequest(
            @NotBlank @Size(max = 80) String name,
            @Size(max = 20) String hsnCode,
            @NotNull @DecimalMin("0.0") BigDecimal gstRate,
            @NotNull @DecimalMin("0.0") BigDecimal cgstRate,
            @NotNull @DecimalMin("0.0") BigDecimal sgstRate,
            @NotNull @DecimalMin("0.0") BigDecimal igstRate,
            boolean exempt,
            Boolean taxInclusive,
            boolean active
    ) {
    }

    public record VariantResponse(Long id, String sku, String barcode, boolean barcodeInternal, String size,
                                  String color, BigDecimal purchasePrice, BigDecimal sellingPrice, BigDecimal mrp,
                                  int reorderLevel, boolean active) {
    }

    public record ProductResponse(Long id, String code, String name, Long categoryId, String categoryName,
                                  Long brandId, String brandName, Long supplierId, String supplierName,
                                  String description, String hsnCode, Long taxCategoryId, String taxCategoryName,
                                  BigDecimal taxRate, boolean taxInclusive, BigDecimal purchasePrice,
                                  BigDecimal sellingPrice, BigDecimal mrp, BigDecimal defaultDiscountPercent,
                                  int reorderLevel, String imageUrl, boolean active, List<VariantResponse> variants) {
    }

    public record SaveVariantRequest(
            Long id,
            @NotBlank @Size(max = 60) String sku,
            @Size(max = 30) String barcode,
            @Size(max = 20) String size,
            @Size(max = 40) String color,
            @NotNull @DecimalMin("0.0") BigDecimal purchasePrice,
            @NotNull @DecimalMin("0.0") BigDecimal sellingPrice,
            @NotNull @DecimalMin("0.0") BigDecimal mrp,
            @Min(0) int reorderLevel,
            boolean active
    ) {
    }

    public record SaveProductRequest(
            @NotBlank @Size(max = 40) String code,
            @NotBlank @Size(max = 200) String name,
            Long categoryId,
            Long brandId,
            Long supplierId,
            @Size(max = 1000) String description,
            @Size(max = 20) String hsnCode,
            Long taxCategoryId,
            @NotNull @DecimalMin("0.0") BigDecimal purchasePrice,
            @NotNull @DecimalMin("0.0") BigDecimal sellingPrice,
            @NotNull @DecimalMin("0.0") BigDecimal mrp,
            @NotNull @DecimalMin("0.0") @jakarta.validation.constraints.DecimalMax("100.0") BigDecimal defaultDiscountPercent,
            @Min(0) int reorderLevel,
            @Size(max = 500) String imageUrl,
            boolean active,
            @NotEmpty @Valid List<SaveVariantRequest> variants
    ) {
    }

    public record VariantSearchResult(Long variantId, Long productId, String productName, String sku,
                                      String barcode, String size, String color, BigDecimal sellingPrice,
                                      BigDecimal mrp, BigDecimal purchasePrice, String taxCategoryName,
                                      BigDecimal taxRate, boolean taxInclusive, long stockQuantity,
                                      int reorderLevel, boolean active) {
    }

    public record BarcodeLabel(Long variantId, String productName, String sku, String size, String color,
                               BigDecimal price, BigDecimal mrp, String barcode, String symbology,
                               boolean internal, String businessName, String branchName) {
    }

    public record GenerateBarcodeRequest(@NotNull Long variantId,
                                         @Pattern(regexp = "EAN13|CODE128") String symbology) {
    }

    public record BarcodeResponse(Long variantId, String barcode, String symbology, boolean internal,
                                  String note) {
    }

    public record AssignBarcodeRequest(@NotNull Long variantId, @NotBlank @Size(max = 30) String barcode) {
    }
}
