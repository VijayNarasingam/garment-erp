package com.garmentshop.erp.business;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class BusinessService {

    private final BusinessRepository businessRepository;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public Business getCurrent() {
        return businessRepository.findById(currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Business not found."));
    }

    @Transactional(readOnly = true)
    public BusinessDtos.BusinessResponse get() {
        return toResponse(getCurrent());
    }

    @Transactional
    public BusinessDtos.BusinessResponse update(BusinessDtos.UpdateBusinessRequest request) {
        Business business = getCurrent();
        Map<String, Object> before = snapshot(business);
        business.setName(request.name().trim());
        business.setLegalName(request.legalName());
        business.setGstEnabled(request.gstEnabled());
        business.setGstin(blankToNull(request.gstin()));
        business.setStateCode(blankToNull(request.stateCode()));
        business.setAddress(request.address());
        business.setPhone(request.phone());
        business.setEmail(request.email());
        business.setFinancialYearStartMonth(request.financialYearStartMonth());
        business.setInvoicePrefix(request.invoicePrefix().trim().toUpperCase());
        business.setRoundOffEnabled(request.roundOffEnabled());
        business.setDefaultTaxInclusive(request.defaultTaxInclusive());
        business.setReturnWindowDays(request.returnWindowDays());
        business.setExchangeWindowDays(request.exchangeWindowDays());
        business.setReturnApprovalRequired(request.returnApprovalRequired());
        business.setRefundToOriginalMethodOnly(request.refundToOriginalMethodOnly());
        business.setMaxDiscountPercent(request.maxDiscountPercent() == null ? BigDecimal.valueOf(50) : request.maxDiscountPercent());
        business.setAllowNegativeStockWithApproval(request.allowNegativeStockWithApproval());
        business.setTimezone(request.timezone() == null ? "Asia/Kolkata" : request.timezone());
        business.setThankYouNote(normalizeThankYouNote(request.thankYouNote()));
        businessRepository.save(business);
        auditService.log("BUSINESS_SETTINGS_UPDATED", "BUSINESS", business.getId(), before, snapshot(business),
                "Business configuration updated", null, null);
        return toResponse(business);
    }

    private Map<String, Object> snapshot(Business b) {
        return Map.ofEntries(
                Map.entry("name", b.getName()),
                Map.entry("gstEnabled", b.isGstEnabled()),
                Map.entry("gstin", b.getGstin() == null ? "" : b.getGstin()),
                Map.entry("invoicePrefix", b.getInvoicePrefix()),
                Map.entry("roundOffEnabled", b.isRoundOffEnabled()),
                Map.entry("returnWindowDays", b.getReturnWindowDays()),
                Map.entry("exchangeWindowDays", b.getExchangeWindowDays()),
                Map.entry("maxDiscountPercent", b.getMaxDiscountPercent()),
                Map.entry("allowNegativeStockWithApproval", b.isAllowNegativeStockWithApproval()),
                Map.entry("costingMethod", b.getCostingMethod().name())
        );
    }

    public BusinessDtos.BusinessResponse toResponse(Business b) {
        return new BusinessDtos.BusinessResponse(b.getId(), b.getName(), b.getLegalName(), b.getCurrency(),
                b.isGstEnabled(), b.getGstin(), b.getStateCode(), b.getAddress(), b.getPhone(), b.getEmail(),
                b.getFinancialYearStartMonth(), b.getInvoicePrefix(), b.isRoundOffEnabled(),
                b.isDefaultTaxInclusive(), b.getCostingMethod().name(), b.getReturnWindowDays(),
                b.getExchangeWindowDays(), b.isReturnApprovalRequired(), b.isRefundToOriginalMethodOnly(),
                b.getMaxDiscountPercent(), b.isAllowNegativeStockWithApproval(), b.getTimezone(), b.getThankYouNote());
    }

    private String normalizeThankYouNote(String value) {
        return value == null || value.isBlank() ? Business.DEFAULT_THANK_YOU_NOTE : value.trim();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
