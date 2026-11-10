package com.garmentshop.erp.catalog;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.Numbering;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.ProductVariant;
import com.garmentshop.erp.repository.BranchRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.ProductVariantRepository;
import com.garmentshop.erp.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class BarcodeService {

    /**
     * GS1 reserves the 2xx prefix for in-store/internal codes. The value is not
     * a company prefix and must never be used for products leaving the store.
     */
    private static final String INTERNAL_PREFIX = "2";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_GENERATION_ATTEMPTS = 25;

    private final ProductVariantRepository variantRepository;
    private final BusinessRepository businessRepository;
    private final BranchRepository branchRepository;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    public String generateInternalEan13() {
        for (int attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
            StringBuilder base = new StringBuilder(INTERNAL_PREFIX);
            for (int i = 0; i < 11; i++) {
                base.append(RANDOM.nextInt(10));
            }
            String candidate = Numbering.ean13(base.toString());
            if (!variantRepository.existsByBarcode(candidate)) {
                return candidate;
            }
        }
        throw ApiException.conflict("BARCODE_GENERATION_FAILED",
                "Could not allocate a unique internal barcode. Please retry.");
    }

    @Transactional
    public CatalogDtos.BarcodeResponse generate(Long variantId, String requestedSymbology) {
        Long businessId = currentUserService.businessId();
        ProductVariant variant = variantRepository.findByIdAndBusinessId(variantId, businessId)
                .orElseThrow(() -> ApiException.notFound("Variant not found."));
        String symbology = requestedSymbology == null || requestedSymbology.isBlank()
                ? "EAN13" : requestedSymbology.trim().toUpperCase();
        if (!symbology.equals("EAN13") && !symbology.equals("CODE128")) {
            throw ApiException.badRequest("INVALID_SYMBOLOGY", "Supported barcode symbologies are EAN13 and CODE128.");
        }
        String before = variant.getBarcode();
        String barcode;
        boolean internal;
        if (symbology.equals("EAN13")) {
            barcode = generateInternalEan13();
            internal = true;
        } else {
            barcode = code128Value(variant);
            if (variantRepository.existsByBarcode(barcode)) {
                barcode = code128Value(variant) + "-" + System.currentTimeMillis();
            }
            internal = true;
        }
        variant.setBarcode(barcode);
        variant.setBarcodeInternal(internal);
        variantRepository.save(variant);
        auditService.log("BARCODE_GENERATED", "PRODUCT_VARIANT", variant.getId(),
                Map.of("barcode", before == null ? "" : before),
                Map.of("barcode", barcode, "symbology", symbology),
                "Barcode generated", null, null);
        return new CatalogDtos.BarcodeResponse(variant.getId(), barcode, symbology, internal,
                symbology.equals("EAN13")
                        ? "Internal EAN-13 for in-store labels only; not a GS1 retail barcode."
                        : "Code 128 payload for label printing.");
    }

    @Transactional
    public CatalogDtos.BarcodeResponse assign(Long variantId, String rawBarcode) {
        Long businessId = currentUserService.businessId();
        ProductVariant variant = variantRepository.findByIdAndBusinessId(variantId, businessId)
                .orElseThrow(() -> ApiException.notFound("Variant not found."));
        String barcode = rawBarcode == null ? "" : rawBarcode.trim();
        if (barcode.isEmpty() || barcode.length() > 30) {
            throw ApiException.badRequest("INVALID_BARCODE", "Barcode must be between 1 and 30 characters.");
        }
        boolean ean13 = barcode.matches("\\d{13}");
        if (barcode.matches("\\d+") && barcode.length() == 13 && !Numbering.validEan13(barcode)) {
            throw ApiException.badRequest("INVALID_BARCODE", "The EAN-13 check digit is invalid.");
        }
        variantRepository.findByBarcodeAndBusinessId(barcode, businessId)
                .filter(existing -> !existing.getId().equals(variant.getId()))
                .ifPresent(existing -> {
                    throw ApiException.conflict("DUPLICATE_BARCODE", "This barcode is already assigned to another variant.");
                });
        if (variantRepository.existsByBarcode(barcode)
                && !barcode.equals(variant.getBarcode())) {
            throw ApiException.conflict("DUPLICATE_BARCODE", "This barcode is already in use.");
        }
        String before = variant.getBarcode();
        variant.setBarcode(barcode);
        variant.setBarcodeInternal(!ean13);
        variantRepository.save(variant);
        auditService.log("BARCODE_ASSIGNED", "PRODUCT_VARIANT", variant.getId(),
                Map.of("barcode", before == null ? "" : before), Map.of("barcode", barcode),
                "Barcode assigned", null, null);
        return new CatalogDtos.BarcodeResponse(variant.getId(), barcode, ean13 ? "EAN13" : "CODE128",
                !ean13, "Barcode assigned.");
    }

    @Transactional(readOnly = true)
    public List<CatalogDtos.BarcodeLabel> labels(List<Long> variantIds, Long branchId) {
        if (variantIds == null || variantIds.isEmpty()) {
            throw ApiException.badRequest("VARIANTS_REQUIRED", "Select at least one variant for label printing.");
        }
        if (variantIds.size() > 200) {
            throw ApiException.badRequest("TOO_MANY_LABELS", "A maximum of 200 labels can be printed at once.");
        }
        Long businessId = currentUserService.businessId();
        Branch branch = branchId == null ? null : currentUserService.branch(branchId);
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        List<CatalogDtos.BarcodeLabel> labels = new ArrayList<>();
        for (Long variantId : variantIds) {
            ProductVariant variant = variantRepository.findByIdAndBusinessId(variantId, businessId)
                    .orElseThrow(() -> ApiException.notFound("Variant " + variantId + " not found."));
            if (variant.getBarcode() == null || variant.getBarcode().isBlank()) {
                throw ApiException.badRequest("BARCODE_MISSING",
                        "Variant " + variant.getSku() + " has no barcode. Generate one before printing labels.");
            }
            labels.add(new CatalogDtos.BarcodeLabel(variant.getId(), variant.getProduct().getName(),
                    variant.getSku(), variant.getSize(), variant.getColor(), variant.getSellingPrice(),
                    variant.getMrp(), variant.getBarcode(),
                    variant.getBarcode().matches("\\d{13}") ? "EAN13" : "CODE128",
                    variant.isBarcodeInternal(), business.getName(), branch == null ? null : branch.getName()));
        }
        return labels;
    }

    private String code128Value(ProductVariant variant) {
        String sku = variant.getSku() == null ? "ITEM" : variant.getSku().replaceAll("[^A-Za-z0-9._-]", "");
        if (sku.isBlank()) {
            sku = "ITEM" + variant.getId();
        }
        return sku.length() > 28 ? sku.substring(0, 28) : sku;
    }
}
