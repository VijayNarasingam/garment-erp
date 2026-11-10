package com.garmentshop.erp.catalog;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.domain.Brand;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.Category;
import com.garmentshop.erp.domain.Product;
import com.garmentshop.erp.domain.ProductVariant;
import com.garmentshop.erp.domain.Supplier;
import com.garmentshop.erp.domain.TaxCategory;
import com.garmentshop.erp.repository.BrandRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.CategoryRepository;
import com.garmentshop.erp.repository.ProductRepository;
import com.garmentshop.erp.repository.ProductVariantRepository;
import com.garmentshop.erp.repository.SupplierRepository;
import com.garmentshop.erp.repository.TaxCategoryRepository;
import com.garmentshop.erp.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CatalogService {

    private final CategoryRepository categoryRepository;
    private final BrandRepository brandRepository;
    private final TaxCategoryRepository taxCategoryRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final SupplierRepository supplierRepository;
    private final BusinessRepository businessRepository;
    private final CurrentUserService currentUserService;
    private final BarcodeService barcodeService;
    private final AuditService auditService;

    // ---------- Categories ----------

    @Transactional(readOnly = true)
    public List<CatalogDtos.CategoryResponse> categories() {
        return categoryRepository.findByBusinessIdOrderByNameAsc(currentUserService.businessId()).stream()
                .map(c -> new CatalogDtos.CategoryResponse(c.getId(), c.getName(), c.getDescription(), c.isActive()))
                .toList();
    }

    @Transactional
    public CatalogDtos.CategoryResponse saveCategory(Long id, CatalogDtos.SaveCategoryRequest request) {
        Long businessId = currentUserService.businessId();
        Category category = id == null ? new Category() : categoryRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Category not found."));
        if (id == null) {
            category.setBusiness(businessRepository.findById(businessId)
                    .orElseThrow(() -> ApiException.notFound("Business not found.")));
        }
        if (categoryRepository.findByBusinessIdOrderByNameAsc(businessId).stream()
                .anyMatch(c -> !c.getId().equals(category.getId()) && c.getName().equalsIgnoreCase(request.name()))) {
            throw ApiException.conflict("DUPLICATE_CATEGORY", "A category with this name already exists.");
        }
        category.setName(request.name().trim());
        category.setDescription(request.description());
        category.setActive(request.active());
        categoryRepository.save(category);
        auditService.log(id == null ? "CATEGORY_CREATED" : "CATEGORY_UPDATED", "CATEGORY", category.getId(),
                null, Map.of("name", category.getName(), "active", category.isActive()),
                "Category saved", null, null);
        return new CatalogDtos.CategoryResponse(category.getId(), category.getName(), category.getDescription(), category.isActive());
    }

    // ---------- Brands ----------

    @Transactional(readOnly = true)
    public List<CatalogDtos.BrandResponse> brands() {
        return brandRepository.findByBusinessIdOrderByNameAsc(currentUserService.businessId()).stream()
                .map(b -> new CatalogDtos.BrandResponse(b.getId(), b.getName(), b.getDescription(), b.isActive()))
                .toList();
    }

    @Transactional
    public CatalogDtos.BrandResponse saveBrand(Long id, CatalogDtos.SaveBrandRequest request) {
        Long businessId = currentUserService.businessId();
        Brand brand = id == null ? new Brand() : brandRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Brand not found."));
        if (id == null) {
            brand.setBusiness(businessRepository.findById(businessId)
                    .orElseThrow(() -> ApiException.notFound("Business not found.")));
        }
        if (brandRepository.findByBusinessIdOrderByNameAsc(businessId).stream()
                .anyMatch(b -> !b.getId().equals(brand.getId()) && b.getName().equalsIgnoreCase(request.name()))) {
            throw ApiException.conflict("DUPLICATE_BRAND", "A brand with this name already exists.");
        }
        brand.setName(request.name().trim());
        brand.setDescription(request.description());
        brand.setActive(request.active());
        brandRepository.save(brand);
        auditService.log(id == null ? "BRAND_CREATED" : "BRAND_UPDATED", "BRAND", brand.getId(), null,
                Map.of("name", brand.getName(), "active", brand.isActive()), "Brand saved", null, null);
        return new CatalogDtos.BrandResponse(brand.getId(), brand.getName(), brand.getDescription(), brand.isActive());
    }

    // ---------- Tax categories ----------

    @Transactional(readOnly = true)
    public List<CatalogDtos.TaxCategoryResponse> taxCategories() {
        return taxCategoryRepository.findByBusinessIdOrderByNameAsc(currentUserService.businessId()).stream()
                .map(this::toTaxResponse)
                .toList();
    }

    @Transactional
    public CatalogDtos.TaxCategoryResponse saveTaxCategory(Long id, CatalogDtos.SaveTaxCategoryRequest request) {
        Long businessId = currentUserService.businessId();
        TaxCategory tax = id == null ? new TaxCategory() : taxCategoryRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Tax category not found."));
        if (id == null) {
            tax.setBusiness(businessRepository.findById(businessId)
                    .orElseThrow(() -> ApiException.notFound("Business not found.")));
        }
        validateTaxRates(request);
        if (taxCategoryRepository.findByBusinessIdOrderByNameAsc(businessId).stream()
                .anyMatch(t -> !t.getId().equals(tax.getId()) && t.getName().equalsIgnoreCase(request.name()))) {
            throw ApiException.conflict("DUPLICATE_TAX", "A tax category with this name already exists.");
        }
        tax.setName(request.name().trim());
        tax.setHsnCode(request.hsnCode());
        tax.setGstRate(Money.of(request.gstRate()));
        tax.setCgstRate(Money.of(request.cgstRate()));
        tax.setSgstRate(Money.of(request.sgstRate()));
        tax.setIgstRate(Money.of(request.igstRate()));
        tax.setExempt(request.exempt());
        tax.setTaxInclusive(request.taxInclusive());
        tax.setActive(request.active());
        taxCategoryRepository.save(tax);
        auditService.log(id == null ? "TAX_CREATED" : "TAX_UPDATED", "TAX_CATEGORY", tax.getId(), null,
                Map.of("name", tax.getName(), "gstRate", tax.getGstRate(), "exempt", tax.isExempt()),
                "Tax category saved — requires accountant verification before production billing", null, null);
        return toTaxResponse(tax);
    }

    private void validateTaxRates(CatalogDtos.SaveTaxCategoryRequest request) {
        BigDecimal gst = Money.of(request.gstRate());
        BigDecimal cgst = Money.of(request.cgstRate());
        BigDecimal sgst = Money.of(request.sgstRate());
        BigDecimal igst = Money.of(request.igstRate());
        if (request.exempt()) {
            if (gst.signum() != 0 || cgst.signum() != 0 || sgst.signum() != 0 || igst.signum() != 0) {
                throw ApiException.badRequest("INVALID_TAX", "An exempt tax category must have zero rates.");
            }
            return;
        }
        if (cgst.add(sgst).compareTo(gst) != 0) {
            throw ApiException.badRequest("INVALID_TAX", "CGST + SGST must equal the total GST rate.");
        }
        if (igst.compareTo(gst) != 0) {
            throw ApiException.badRequest("INVALID_TAX", "IGST must equal the total GST rate.");
        }
    }

    // ---------- Products ----------

    @Transactional(readOnly = true)
    public Page<CatalogDtos.ProductResponse> products(String q, Long categoryId, Boolean active, int page, int size) {
        Long businessId = currentUserService.businessId();
        Page<Product> products = productRepository.search(businessId, blankToNull(q), categoryId, active,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100), Sort.by("name")));
        return products.map(this::toProductResponse);
    }

    @Transactional(readOnly = true)
    public CatalogDtos.ProductResponse product(Long id) {
        Product product = productRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Product not found."));
        return toProductResponse(product);
    }

    @Transactional
    public CatalogDtos.ProductResponse createProduct(CatalogDtos.SaveProductRequest request) {
        Long businessId = currentUserService.businessId();
        if (productRepository.existsByBusinessIdAndCodeIgnoreCase(businessId, request.code())) {
            throw ApiException.conflict("DUPLICATE_PRODUCT", "A product with this code already exists.");
        }
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        Product product = new Product();
        product.setBusiness(business);
        applyProduct(product, request);
        productRepository.save(product);
        replaceVariants(product, request.variants());
        auditService.log("PRODUCT_CREATED", "PRODUCT", product.getId(), null,
                Map.of("code", product.getCode(), "name", product.getName()), "Product created", null, null);
        return toProductResponse(product);
    }

    @Transactional
    public CatalogDtos.ProductResponse updateProduct(Long id, CatalogDtos.SaveProductRequest request) {
        Long businessId = currentUserService.businessId();
        Product product = productRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Product not found."));
        if (!product.getCode().equalsIgnoreCase(request.code())
                && productRepository.existsByBusinessIdAndCodeIgnoreCase(businessId, request.code())) {
            throw ApiException.conflict("DUPLICATE_PRODUCT", "A product with this code already exists.");
        }
        Map<String, Object> before = Map.of("code", product.getCode(), "name", product.getName(),
                "active", product.isActive(), "sellingPrice", product.getSellingPrice());
        applyProduct(product, request);
        productRepository.save(product);
        replaceVariants(product, request.variants());
        auditService.log("PRODUCT_UPDATED", "PRODUCT", product.getId(), before,
                Map.of("code", product.getCode(), "name", product.getName(), "active", product.isActive(),
                        "sellingPrice", product.getSellingPrice()), "Product updated", null, null);
        return toProductResponse(product);
    }

    @Transactional
    public CatalogDtos.ProductResponse setProductActive(Long id, boolean active) {
        Long businessId = currentUserService.businessId();
        Product product = productRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Product not found."));
        boolean before = product.isActive();
        product.setActive(active);
        productRepository.save(product);
        auditService.log(active ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED", "PRODUCT", id,
                Map.of("active", before), Map.of("active", active), "Product status changed", null, null);
        return toProductResponse(product);
    }

    private void applyProduct(Product product, CatalogDtos.SaveProductRequest request) {
        Long businessId = currentUserService.businessId();
        product.setCode(request.code().trim().toUpperCase());
        product.setName(request.name().trim());
        product.setDescription(request.description());
        product.setHsnCode(request.hsnCode());
        product.setPurchasePrice(Money.of(request.purchasePrice()));
        product.setSellingPrice(Money.of(request.sellingPrice()));
        product.setMrp(Money.of(request.mrp()));
        product.setDefaultDiscountPercent(Money.of(request.defaultDiscountPercent()));
        product.setReorderLevel(request.reorderLevel());
        product.setImageUrl(request.imageUrl());
        product.setActive(request.active());
        product.setCategory(request.categoryId() == null ? null : categoryRepository
                .findByIdAndBusinessId(request.categoryId(), businessId)
                .orElseThrow(() -> ApiException.badRequest("INVALID_CATEGORY", "Category not found.")));
        product.setBrand(request.brandId() == null ? null : brandRepository
                .findByIdAndBusinessId(request.brandId(), businessId)
                .orElseThrow(() -> ApiException.badRequest("INVALID_BRAND", "Brand not found.")));
        product.setSupplier(request.supplierId() == null ? null : supplierRepository
                .findByIdAndBusinessId(request.supplierId(), businessId)
                .orElseThrow(() -> ApiException.badRequest("INVALID_SUPPLIER", "Supplier not found.")));
        product.setTaxCategory(request.taxCategoryId() == null ? null : taxCategoryRepository
                .findByIdAndBusinessId(request.taxCategoryId(), businessId)
                .orElseThrow(() -> ApiException.badRequest("INVALID_TAX", "Tax category not found.")));
    }

    private void replaceVariants(Product product, List<CatalogDtos.SaveVariantRequest> requests) {
        List<ProductVariant> existing = variantRepository.findByProductIdOrderBySizeAscColorAsc(product.getId());
        Set<Long> keptIds = new HashSet<>();
        for (CatalogDtos.SaveVariantRequest request : requests) {
            ProductVariant variant;
            if (request.id() != null) {
                variant = existing.stream().filter(v -> v.getId().equals(request.id())).findFirst()
                        .orElseThrow(() -> ApiException.badRequest("INVALID_VARIANT", "Variant does not belong to this product."));
                keptIds.add(variant.getId());
            } else {
                variant = new ProductVariant();
                variant.setProduct(product);
                variant.setBusiness(product.getBusiness());
            }
            String sku = request.sku().trim().toUpperCase();
            if (variantRepository.findAllActiveWithProduct(product.getBusiness().getId()).stream()
                    .anyMatch(v -> !Objects.equals(v.getId(), variant.getId()) && v.getSku().equalsIgnoreCase(sku))) {
                throw ApiException.conflict("DUPLICATE_SKU", "SKU " + sku + " is already in use.");
            }
            variant.setSku(sku);
            String barcode = blankToNull(request.barcode());
            if (barcode != null) {
                variantRepository.findAll().stream()
                        .filter(v -> !Objects.equals(v.getId(), variant.getId()))
                        .filter(v -> barcode.equals(v.getBarcode()))
                        .findFirst()
                        .ifPresent(v -> {
                            throw ApiException.conflict("DUPLICATE_BARCODE", "Barcode is already assigned to another variant.");
                        });
                if (barcode.matches("\\d{13}") && !com.garmentshop.erp.common.Numbering.validEan13(barcode)) {
                    throw ApiException.badRequest("INVALID_BARCODE", "EAN-13 check digit is invalid.");
                }
                variant.setBarcode(barcode);
                variant.setBarcodeInternal(false);
            } else if (variant.getBarcode() == null) {
                variant.setBarcode(barcodeService.generateInternalEan13());
                variant.setBarcodeInternal(true);
            }
            variant.setSize(request.size());
            variant.setColor(request.color());
            variant.setPurchasePrice(Money.of(request.purchasePrice()));
            variant.setSellingPrice(Money.of(request.sellingPrice()));
            variant.setMrp(Money.of(request.mrp()));
            variant.setReorderLevel(request.reorderLevel());
            variant.setActive(request.active());
            variantRepository.save(variant);
        }
        existing.stream().filter(v -> !keptIds.contains(v.getId())).forEach(v -> {
            v.setActive(false);
            variantRepository.save(v);
        });
    }

    @Transactional(readOnly = true)
    public List<CatalogDtos.VariantSearchResult> searchVariants(String q) {
        Long businessId = currentUserService.businessId();
        String term = blankToNull(q);
        if (term == null || term.isBlank()) {
            return List.of();
        }
        return variantRepository.search(businessId, term).stream()
                .limit(40)
                .map(v -> toSearchResult(v, 0))
                .toList();
    }

    public CatalogDtos.VariantSearchResult toSearchResult(ProductVariant variant, long stock) {
        Product product = variant.getProduct();
        TaxCategory tax = product.getTaxCategory();
        return new CatalogDtos.VariantSearchResult(variant.getId(), product.getId(), product.getName(),
                variant.getSku(), variant.getBarcode(), variant.getSize(), variant.getColor(),
                variant.getSellingPrice(), variant.getMrp(), variant.getPurchasePrice(),
                tax == null ? null : tax.getName(), tax == null ? BigDecimal.ZERO : tax.getGstRate(),
                tax != null && Boolean.TRUE.equals(tax.getTaxInclusive()),
                stock, variant.getReorderLevel(), variant.isActive());
    }

    public CatalogDtos.ProductResponse toProductResponse(Product product) {
        List<CatalogDtos.VariantResponse> variants = variantRepository
                .findByProductIdOrderBySizeAscColorAsc(product.getId()).stream()
                .map(v -> new CatalogDtos.VariantResponse(v.getId(), v.getSku(), v.getBarcode(),
                        v.isBarcodeInternal(), v.getSize(), v.getColor(), v.getPurchasePrice(),
                        v.getSellingPrice(), v.getMrp(), v.getReorderLevel(), v.isActive()))
                .toList();
        TaxCategory tax = product.getTaxCategory();
        return new CatalogDtos.ProductResponse(product.getId(), product.getCode(), product.getName(),
                product.getCategory() == null ? null : product.getCategory().getId(),
                product.getCategory() == null ? null : product.getCategory().getName(),
                product.getBrand() == null ? null : product.getBrand().getId(),
                product.getBrand() == null ? null : product.getBrand().getName(),
                product.getSupplier() == null ? null : product.getSupplier().getId(),
                product.getSupplier() == null ? null : product.getSupplier().getName(),
                product.getDescription(), product.getHsnCode(),
                tax == null ? null : tax.getId(), tax == null ? null : tax.getName(),
                tax == null ? BigDecimal.ZERO : tax.getGstRate(),
                tax != null && Boolean.TRUE.equals(tax.getTaxInclusive()),
                product.getPurchasePrice(), product.getSellingPrice(), product.getMrp(),
                product.getDefaultDiscountPercent(), product.getReorderLevel(), product.getImageUrl(),
                product.isActive(), variants);
    }

    private CatalogDtos.TaxCategoryResponse toTaxResponse(TaxCategory tax) {
        return new CatalogDtos.TaxCategoryResponse(tax.getId(), tax.getName(), tax.getHsnCode(), tax.getGstRate(),
                tax.getCgstRate(), tax.getSgstRate(), tax.getIgstRate(), tax.isExempt(), tax.getTaxInclusive(),
                tax.isActive());
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
