package com.garmentshop.erp.accounting;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class AccountingDtos {

    private AccountingDtos() {
    }

    public record AccountResponse(Long id, String code, String name, String type, String subtype,
                                  boolean systemAccount, boolean cashBank, boolean active) {
    }

    public record CreateAccountRequest(
            @NotBlank @Size(max = 20) String code,
            @NotBlank @Size(max = 150) String name,
            @NotBlank String type,
            @Size(max = 60) String subtype,
            Long parentId,
            Boolean cashBank
    ) {
    }

    public record PeriodRequest(
            @NotBlank @Size(max = 100) String name,
            @NotNull LocalDate startDate,
            @NotNull LocalDate endDate,
            @Size(max = 500) String notes
    ) {
    }

    public record PeriodResponse(Long id, String name, LocalDate startDate, LocalDate endDate, String status,
                                 String closedByName, Instant closedAt, String notes) {
    }

    public record ReopenPeriodRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record JournalLineRequest(
            @NotNull Long accountId,
            @DecimalMin("0.0") BigDecimal debit,
            @DecimalMin("0.0") BigDecimal credit,
            @Size(max = 300) String description,
            Long customerId,
            Long supplierId
    ) {
    }

    public record ManualJournalRequest(
            @NotNull Long branchId,
            LocalDate entryDate,
            @NotBlank @Size(max = 300) String description,
            @Size(max = 80) String reference,
            @NotEmpty @Valid List<JournalLineRequest> lines
    ) {
    }

    public record JournalLineResponse(Long id, Long accountId, String accountCode, String accountName,
                                      BigDecimal debit, BigDecimal credit, String description) {
    }

    public record JournalResponse(Long id, String entryNo, LocalDate entryDate, String description,
                                  String sourceType, String sourceId, String status, String branchName,
                                  String createdByName, Instant postedAt, List<JournalLineResponse> lines) {
    }

    public record TrialBalanceRow(Long accountId, String code, String name, String type,
                                  BigDecimal debit, BigDecimal credit, BigDecimal balance) {
    }

    public record TrialBalanceResponse(LocalDate from, LocalDate to, List<TrialBalanceRow> rows,
                                       BigDecimal totalDebit, BigDecimal totalCredit, boolean balanced) {
    }

    public record LedgerRow(LocalDate date, String entryNo, String description, String lineDescription,
                            String branchName, BigDecimal debit, BigDecimal credit, BigDecimal balance) {
    }

    public record AccountLedgerResponse(Long accountId, String code, String name, String type,
                                        LocalDate from, LocalDate to, BigDecimal openingBalance,
                                        BigDecimal totalDebit, BigDecimal totalCredit,
                                        BigDecimal closingBalance, List<LedgerRow> rows) {
    }

    public record ProfitLossLine(String code, String name, BigDecimal amount) {
    }

    public record ProfitLossResponse(LocalDate from, LocalDate to, List<ProfitLossLine> income,
                                     List<ProfitLossLine> expenses, BigDecimal totalIncome,
                                     BigDecimal totalExpenses, BigDecimal netProfit) {
    }

    public record BalanceSheetResponse(LocalDate asOf, List<ProfitLossLine> assets,
                                       List<ProfitLossLine> liabilities, List<ProfitLossLine> equity,
                                       BigDecimal totalAssets, BigDecimal totalLiabilities,
                                       BigDecimal totalEquity, BigDecimal currentEarnings,
                                       BigDecimal difference) {
    }

    public record GstRateRow(BigDecimal taxRate, BigDecimal taxableAmount, BigDecimal taxAmount,
                             long quantity) {
    }

    public record GstSummaryResponse(LocalDate from, LocalDate to, BigDecimal outputTax, BigDecimal inputTax,
                                     BigDecimal netPayable, List<GstRateRow> salesByRate,
                                     List<GstRateRow> purchasesByRate) {
    }

    public record DayBookResponse(LocalDate from, LocalDate to, List<JournalResponse> entries) {
    }
}
