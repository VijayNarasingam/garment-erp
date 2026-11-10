package com.garmentshop.erp.common;

import java.time.LocalDate;

public record FinancialYear(String label, LocalDate start, LocalDate end) {

    public static FinancialYear of(LocalDate date, int startMonth) {
        int month = startMonth < 1 || startMonth > 12 ? 4 : startMonth;
        int startYear = date.getMonthValue() >= month ? date.getYear() : date.getYear() - 1;
        LocalDate start = LocalDate.of(startYear, month, 1);
        LocalDate end = start.plusYears(1).minusDays(1);
        String label = startYear + "-" + String.valueOf(startYear + 1).substring(2);
        return new FinancialYear(label, start, end);
    }

    public static FinancialYear current(int startMonth) {
        return of(LocalDate.now(), startMonth);
    }
}
