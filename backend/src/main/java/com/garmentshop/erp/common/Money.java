package com.garmentshop.erp.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Money {

    public static final int SCALE = 2;
    public static final RoundingMode ROUNDING = RoundingMode.HALF_UP;
    public static final BigDecimal ZERO = BigDecimal.ZERO.setScale(SCALE, ROUNDING);

    private Money() {
    }

    public static BigDecimal of(BigDecimal value) {
        return value == null ? ZERO : value.setScale(SCALE, ROUNDING);
    }

    public static BigDecimal of(double value) {
        return BigDecimal.valueOf(value).setScale(SCALE, ROUNDING);
    }

    public static BigDecimal nz(BigDecimal value) {
        return value == null ? ZERO : value;
    }

    public static BigDecimal roundOff(BigDecimal value) {
        BigDecimal rounded = value.setScale(0, ROUNDING);
        return rounded.setScale(SCALE, ROUNDING).subtract(of(value));
    }

    public static BigDecimal percentOf(BigDecimal base, BigDecimal percent) {
        if (base == null || percent == null) {
            return ZERO;
        }
        return base.multiply(percent).divide(BigDecimal.valueOf(100), SCALE, ROUNDING);
    }

    public static boolean eq(BigDecimal a, BigDecimal b) {
        return of(a).compareTo(of(b)) == 0;
    }
}
