package com.garmentshop.erp.catalog;

import com.garmentshop.erp.common.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/catalog")
@RequiredArgsConstructor
public class CatalogController {

    private final CatalogService catalogService;
    private final BarcodeService barcodeService;

    // ---------- Categories ----------

    @GetMapping("/categories")
    @PreAuthorize("hasAuthority('product.view') or hasAuthority('product.manage')")
    public List<CatalogDtos.CategoryResponse> categories() {
        return catalogService.categories();
    }

    @PostMapping("/categories")
    @PreAuthorize("hasAuthority('product.manage')")
    public CatalogDtos.CategoryResponse createCategory(@Valid @RequestBody CatalogDtos.SaveCategoryRequest request) {
        return catalogService.saveCategory(null, request);
    }

    @PutMapping("/categories/{id}")
    @PreAuthorize("hasAuthority('product.manage')")
    public CatalogDtos.CategoryResponse updateCategory(@PathVariable Long id,
                                                       @Valid @RequestBody CatalogDtos.SaveCategoryRequest request) {
        return catalogService.saveCategory(id, request);
    }

    // ---------- Brands ----------

    @GetMapping("/brands")
    @PreAuthorize("hasAuthority('product.view') or hasAuthority('product.manage')")
    public List<CatalogDtos.BrandResponse> brands() {
        return catalogService.brands();
    }

    @PostMapping("/brands")
    @PreAuthorize("hasAuthority('product.manage')")
    public CatalogDtos.BrandResponse createBrand(@Valid @RequestBody CatalogDtos.SaveBrandRequest request) {
        return catalogService.saveBrand(null, request);
    }

    @PutMapping("/brands/{id}")
    @PreAuthorize("hasAuthority('product.manage')")
    public CatalogDtos.BrandResponse updateBrand(@PathVariable Long id,
                                                @Valid @RequestBody CatalogDtos.SaveBrandRequest request) {
        return catalogService.saveBrand(id, request);
    }

    // ---------- Tax categories ----------

    @GetMapping("/tax-categories")
    @PreAuthorize("hasAuthority('product.view') or hasAuthority('tax.manage')")
    public List<CatalogDtos.TaxCategoryResponse> taxCategories() {
        return catalogService.taxCategories();
    }

    @PostMapping("/tax-categories")
    @PreAuthorize("hasAuthority('tax.manage')")
    public CatalogDtos.TaxCategoryResponse createTaxCategory(
            @Valid @RequestBody CatalogDtos.SaveTaxCategoryRequest request) {
        return catalogService.saveTaxCategory(null, request);
    }

    @PutMapping("/tax-categories/{id}")
    @PreAuthorize("hasAuthority('tax.manage')")
    public CatalogDtos.TaxCategoryResponse updateTaxCategory(
            @PathVariable Long id, @Valid @RequestBody CatalogDtos.SaveTaxCategoryRequest request) {
        return catalogService.saveTaxCategory(id, request);
    }

    // ---------- Products ----------

    @GetMapping("/products")
    @PreAuthorize("hasAuthority('product.view') or hasAuthority('product.manage') or hasAuthority('pos.bill')")
    public PageResponse<CatalogDtos.ProductResponse> products(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) Boolean active,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return PageResponse.of(catalogService.products(q, categoryId, active, page, size));
    }

    @GetMapping("/products/{id}")
    @PreAuthorize("hasAuthority('product.view') or hasAuthority('product.manage')")
    public CatalogDtos.ProductResponse product(@PathVariable Long id) {
        return catalogService.product(id);
    }

    @PostMapping("/products")
    @PreAuthorize("hasAuthority('product.manage')")
    public CatalogDtos.ProductResponse createProduct(@Valid @RequestBody CatalogDtos.SaveProductRequest request) {
        return catalogService.createProduct(request);
    }

    @PutMapping("/products/{id}")
    @PreAuthorize("hasAuthority('product.manage')")
    public CatalogDtos.ProductResponse updateProduct(@PathVariable Long id,
                                                     @Valid @RequestBody CatalogDtos.SaveProductRequest request) {
        return catalogService.updateProduct(id, request);
    }

    @PatchMapping("/products/{id}/status")
    @PreAuthorize("hasAuthority('product.manage')")
    public CatalogDtos.ProductResponse setProductStatus(@PathVariable Long id, @RequestParam boolean active) {
        return catalogService.setProductActive(id, active);
    }

    // ---------- Variant lookup ----------

    @GetMapping("/variants/search")
    @PreAuthorize("hasAuthority('product.view') or hasAuthority('pos.bill') or hasAuthority('inventory.view')")
    public List<CatalogDtos.VariantSearchResult> searchVariants(@RequestParam String q) {
        return catalogService.searchVariants(q);
    }

    // ---------- Barcodes ----------

    @PostMapping("/barcodes/generate")
    @PreAuthorize("hasAuthority('barcode.manage')")
    public CatalogDtos.BarcodeResponse generateBarcode(
            @Valid @RequestBody CatalogDtos.GenerateBarcodeRequest request) {
        return barcodeService.generate(request.variantId(), request.symbology());
    }

    @PostMapping("/barcodes/assign")
    @PreAuthorize("hasAuthority('barcode.manage')")
    public CatalogDtos.BarcodeResponse assignBarcode(
            @Valid @RequestBody CatalogDtos.AssignBarcodeRequest request) {
        return barcodeService.assign(request.variantId(), request.barcode());
    }

    @GetMapping("/barcodes/labels")
    @PreAuthorize("hasAuthority('barcode.manage') or hasAuthority('product.view')")
    public List<CatalogDtos.BarcodeLabel> labels(@RequestParam List<Long> variantIds,
                                                 @RequestParam(required = false) Long branchId) {
        return barcodeService.labels(variantIds, branchId);
    }
}
