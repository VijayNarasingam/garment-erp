package com.garmentshop.erp.common;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

public final class Numbering {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyyMMdd", Locale.ENGLISH);

    private Numbering() {
    }

    public static String sequence(String prefix, String financialYear, long number) {
        String cleanPrefix = prefix == null ? "" : prefix.trim().toUpperCase(Locale.ENGLISH);
        String fy = financialYear == null ? "" : financialYear;
        return (cleanPrefix.isEmpty() ? "" : cleanPrefix + "/") + fy + "/" + String.format("%06d", number);
    }

    public static String dated(String prefix, LocalDate date, long number) {
        return prefix + "-" + DATE.format(date) + "-" + String.format("%05d", number);
    }

    public static String ean13(String base12) {
        if (base12 == null || !base12.matches("\\d{12}")) {
            throw ApiException.badRequest("INVALID_EAN", "EAN-13 generation requires exactly 12 digits.");
        }
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            int digit = base12.charAt(i) - '0';
            sum += (i % 2 == 0) ? digit : digit * 3;
        }
        int check = (10 - (sum % 10)) % 10;
        return base12 + check;
    }

    public static boolean validEan13(String value) {
        if (value == null || !value.matches("\\d{13}")) {
            return false;
        }
        return ean13(value.substring(0, 12)).equals(value);
    }
}
