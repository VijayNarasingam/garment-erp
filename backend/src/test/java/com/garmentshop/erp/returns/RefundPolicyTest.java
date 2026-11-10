package com.garmentshop.erp.returns;

import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.PaymentMethod;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class RefundPolicyTest {

    @Test
    void doesNotApplyWhenBusinessAllowsAnyRefundMethod() {
        assertThat(RefundPolicy.applies(false, new BigDecimal("100.00"), PaymentMethod.UPI)).isFalse();
    }

    @Test
    void doesNotApplyWhenRefundAmountIsZeroOrNegative() {
        assertThat(RefundPolicy.applies(true, BigDecimal.ZERO, PaymentMethod.UPI)).isFalse();
        assertThat(RefundPolicy.applies(true, new BigDecimal("-1.00"), PaymentMethod.UPI)).isFalse();
    }

    @Test
    void doesNotApplyToStoreCredit() {
        assertThat(RefundPolicy.applies(true, new BigDecimal("100.00"), PaymentMethod.ADVANCE)).isFalse();
    }

    @Test
    void appliesToPositiveCashEquivalentRefund() {
        assertThat(RefundPolicy.applies(true, new BigDecimal("100.00"), PaymentMethod.UPI)).isTrue();
    }

    @Test
    void allowsRefundToTheOriginalMethod() {
        assertThatCode(() -> RefundPolicy.validate(List.of(PaymentMethod.CASH), PaymentMethod.CASH))
                .doesNotThrowAnyException();
    }

    @Test
    void allowsAnyOneOfMultipleOriginalMethods() {
        assertThatCode(() -> RefundPolicy.validate(
                List.of(PaymentMethod.CASH, PaymentMethod.UPI, PaymentMethod.CARD), PaymentMethod.UPI))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsDifferentMethodAndListsAllowedOnes() {
        ApiException error = catchThrowableOfType(
                () -> RefundPolicy.validate(List.of(PaymentMethod.UPI, PaymentMethod.CASH), PaymentMethod.CARD),
                ApiException.class);

        assertThat(error.getCode()).isEqualTo("REFUND_METHOD_NOT_ALLOWED");
        assertThat(error.getStatus().value()).isEqualTo(400);
        assertThat(error.getMessage()).contains("CASH, UPI");
    }

    @Test
    void rejectsWhenInvoiceHasNoOriginalCashMethod() {
        ApiException error = catchThrowableOfType(
                () -> RefundPolicy.validate(List.of(), PaymentMethod.CASH), ApiException.class);

        assertThat(error.getCode()).isEqualTo("REFUND_METHOD_NOT_ALLOWED");
        assertThat(error.getMessage()).contains("ADVANCE");
    }

    @Test
    void rejectsWhenOriginalMethodsAreUnknown() {
        ApiException error = catchThrowableOfType(
                () -> RefundPolicy.validate(null, PaymentMethod.CASH), ApiException.class);

        assertThat(error.getCode()).isEqualTo("REFUND_METHOD_NOT_ALLOWED");
    }
}
