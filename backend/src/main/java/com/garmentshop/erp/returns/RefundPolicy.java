package com.garmentshop.erp.returns;

import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.PaymentMethod;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Business rule for "refund only to the original payment method".
 *
 * <p>Extracted from {@link ReturnService} so the rule can be unit tested without persistence.
 * {@link PaymentMethod#ADVANCE} is always allowed because store credit is not a cash refund.</p>
 */
public final class RefundPolicy {

    private RefundPolicy() {
    }

    /**
     * Whether the original-method rule has to be evaluated for this refund at all.
     */
    public static boolean applies(boolean originalMethodOnly, BigDecimal refundAmount, PaymentMethod refundMethod) {
        return originalMethodOnly
                && refundAmount != null
                && refundAmount.signum() > 0
                && refundMethod != null
                && refundMethod != PaymentMethod.ADVANCE;
    }

    /**
     * Validates the requested refund method against the methods used to pay the original invoice.
     *
     * @throws ApiException {@code REFUND_METHOD_NOT_ALLOWED} when the method is not one of the originals
     *                      or when the invoice has no cash-equivalent original method
     */
    public static void validate(List<PaymentMethod> originalMethods, PaymentMethod refundMethod) {
        if (originalMethods == null || originalMethods.isEmpty()) {
            throw ApiException.badRequest("REFUND_METHOD_NOT_ALLOWED",
                    "This invoice has no original cash payment method to refund to. "
                            + "Choose ADVANCE to issue store credit instead.");
        }
        if (!originalMethods.contains(refundMethod)) {
            String allowed = originalMethods.stream().map(Enum::name).sorted()
                    .collect(Collectors.joining(", "));
            throw ApiException.badRequest("REFUND_METHOD_NOT_ALLOWED",
                    "This business refunds only to the original payment method (" + allowed
                            + "). Choose ADVANCE to issue store credit instead.");
        }
    }
}
