package com.garmentshop.erp.business;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.security.CurrentUserService;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BusinessReceiptSettingsTest {

    private final BusinessRepository repository = mock(BusinessRepository.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final AuditService auditService = mock(AuditService.class);
    private final BusinessService service = new BusinessService(repository, currentUserService, auditService);

    @Test
    void persistsReceiptTemplateAndNormalizesBlankUpiFields() {
        Business business = new Business();
        business.setName("Shree Fashion");
        when(currentUserService.businessId()).thenReturn(1L);
        when(repository.findById(1L)).thenReturn(Optional.of(business));
        when(repository.save(any(Business.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BusinessDtos.BusinessResponse response = service.update(request("  ", "  ", "  "));

        assertThat(business.isReceiptShowCustomer()).isTrue();
        assertThat(business.isReceiptShowCashier()).isTrue();
        assertThat(business.isReceiptShowPayment()).isTrue();
        assertThat(business.isReceiptShowUpiQr()).isTrue();
        assertThat(business.isReceiptShowTerms()).isTrue();
        assertThat(business.isReceiptShowSku()).isTrue();
        assertThat(business.isReceiptShowSizeColor()).isTrue();
        assertThat(business.isReceiptShowHsn()).isTrue();
        assertThat(business.isReceiptShowItemRate()).isFalse();
        assertThat(business.isReceiptShowItemDiscount()).isFalse();
        assertThat(business.getReceiptTerms()).isNull();
        assertThat(business.getUpiId()).isNull();
        assertThat(business.getUpiPayeeName()).isNull();
        assertThat(response.upiId()).isNull();
        assertThat(response.receiptTerms()).isNull();
        assertThat(response.receiptShowCustomer()).isTrue();
        assertThat(response.receiptShowItemRate()).isFalse();
        verify(repository).save(business);
        verify(auditService).log(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void keepsConfiguredUpiValues() {
        Business business = new Business();
        business.setName("Shree Fashion");
        when(currentUserService.businessId()).thenReturn(1L);
        when(repository.findById(1L)).thenReturn(Optional.of(business));
        when(repository.save(any(Business.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.update(request(" shreefashion@okaxis ", " Shree Fashion ", " Exchange within 15 days. "));

        assertThat(business.getUpiId()).isEqualTo("shreefashion@okaxis");
        assertThat(business.getUpiPayeeName()).isEqualTo("Shree Fashion");
        assertThat(business.getReceiptTerms()).isEqualTo("Exchange within 15 days.");
    }

    @Test
    void rejectsMalformedUpiIdButAllowsBlank() {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

        assertThat(validator.validate(request("not-a-vpa", "Shop", null))).isNotEmpty();
        assertThat(validator.validate(request("shop@bank", "Shop", null))).isEmpty();
        assertThat(validator.validate(request("", "Shop", null))).isEmpty();
    }

    @Test
    void newBusinessUsesApprovedReceiptDefaults() {
        Business business = new Business();

        assertThat(business.isReceiptShowCustomer()).isTrue();
        assertThat(business.isReceiptShowCashier()).isTrue();
        assertThat(business.isReceiptShowPayment()).isTrue();
        assertThat(business.isReceiptShowUpiQr()).isTrue();
        assertThat(business.isReceiptShowTerms()).isTrue();
        assertThat(business.isReceiptShowSku()).isFalse();
        assertThat(business.isReceiptShowSizeColor()).isFalse();
        assertThat(business.isReceiptShowHsn()).isFalse();
        assertThat(business.isReceiptShowItemRate()).isTrue();
        assertThat(business.isReceiptShowItemDiscount()).isTrue();
    }

    private BusinessDtos.UpdateBusinessRequest request(String upiId, String payee, String terms) {
        return new BusinessDtos.UpdateBusinessRequest(
                "Shree Fashion", null, true, "33ABCDE1234F1Z5", "33", "12 Gandhi Street",
                "9876543210", "shop@example.com", 4, "INV", true, false, 7, 15, true, true,
                BigDecimal.valueOf(50), true, "Asia/Kolkata", "Thank you",
                true, true, true, true, true,
                true, true, true,
                false, false,
                terms, upiId, payee);
    }
}
