package com.garmentshop.erp.accounting;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/accounting")
@RequiredArgsConstructor
public class AccountingController {

    private final AccountingReportService accountingReportService;
    private final ReportExportService reportExportService;

    // ---------- Chart of accounts ----------

    @GetMapping("/accounts")
    @PreAuthorize("hasAuthority('accounting.view') or hasAuthority('settings.view')")
    public List<AccountingDtos.AccountResponse> accounts(
            @RequestParam(defaultValue = "false") boolean includeInactive) {
        return accountingReportService.accounts(includeInactive);
    }

    @PostMapping("/accounts")
    @PreAuthorize("hasAuthority('accounting.manage')")
    public AccountingDtos.AccountResponse createAccount(
            @Valid @RequestBody AccountingDtos.CreateAccountRequest request) {
        return accountingReportService.createAccount(request);
    }

    // ---------- Financial periods ----------

    @GetMapping("/periods")
    @PreAuthorize("hasAuthority('accounting.view')")
    public List<AccountingDtos.PeriodResponse> periods() {
        return accountingReportService.periods();
    }

    @PostMapping("/periods")
    @PreAuthorize("hasAuthority('accounting.close')")
    public AccountingDtos.PeriodResponse createPeriod(@Valid @RequestBody AccountingDtos.PeriodRequest request) {
        return accountingReportService.createPeriod(request);
    }

    @PostMapping("/periods/{id}/close")
    @PreAuthorize("hasAuthority('accounting.close')")
    public AccountingDtos.PeriodResponse closePeriod(@PathVariable Long id) {
        return accountingReportService.closePeriod(id);
    }

    @PostMapping("/periods/{id}/reopen")
    @PreAuthorize("hasAuthority('accounting.close')")
    public AccountingDtos.PeriodResponse reopenPeriod(@PathVariable Long id,
                                                      @Valid @RequestBody AccountingDtos.ReopenPeriodRequest request) {
        return accountingReportService.reopenPeriod(id, request.reason());
    }

    // ---------- Journals ----------

    @GetMapping("/journals/{id}")
    @PreAuthorize("hasAuthority('accounting.view')")
    public AccountingDtos.JournalResponse journal(@PathVariable Long id) {
        return accountingReportService.journal(id);
    }

    @PostMapping("/journals")
    @PreAuthorize("hasAuthority('accounting.manage')")
    public AccountingDtos.JournalResponse manualJournal(
            @Valid @RequestBody AccountingDtos.ManualJournalRequest request) {
        return accountingReportService.manualJournal(request);
    }

    // ---------- Reports ----------

    @GetMapping("/trial-balance")
    @PreAuthorize("hasAuthority('accounting.view') or hasAuthority('report.view')")
    public AccountingDtos.TrialBalanceResponse trialBalance(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return accountingReportService.trialBalance(branchId, from, to);
    }

    @GetMapping("/accounts/{id}/ledger")
    @PreAuthorize("hasAuthority('accounting.view') or hasAuthority('report.view')")
    public AccountingDtos.AccountLedgerResponse ledger(
            @PathVariable Long id,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return accountingReportService.accountLedger(id, branchId, from, to);
    }

    @GetMapping("/profit-loss")
    @PreAuthorize("hasAuthority('report.view')")
    public AccountingDtos.ProfitLossResponse profitLoss(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return accountingReportService.profitLoss(branchId, from, to);
    }

    @GetMapping("/balance-sheet")
    @PreAuthorize("hasAuthority('report.view')")
    public AccountingDtos.BalanceSheetResponse balanceSheet(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        return accountingReportService.balanceSheet(branchId, asOf);
    }

    @GetMapping("/gst-summary")
    @PreAuthorize("hasAuthority('report.view')")
    public AccountingDtos.GstSummaryResponse gstSummary(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return accountingReportService.gstSummary(branchId, from, to);
    }

    @GetMapping("/day-book")
    @PreAuthorize("hasAuthority('accounting.view') or hasAuthority('report.view')")
    public AccountingDtos.DayBookResponse dayBook(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return accountingReportService.dayBook(branchId, from, to);
    }

    // ---------- Report exports ----------

    @GetMapping("/trial-balance/export")
    @PreAuthorize("hasAuthority('report.export')")
    public ResponseEntity<byte[]> exportTrialBalance(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "pdf") String format) {
        return download(reportExportService.trialBalance(branchId, from, to, format),
                "trial-balance", format);
    }

    @GetMapping("/profit-loss/export")
    @PreAuthorize("hasAuthority('report.export')")
    public ResponseEntity<byte[]> exportProfitLoss(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "pdf") String format) {
        return download(reportExportService.profitLoss(branchId, from, to, format), "profit-loss", format);
    }

    @GetMapping("/balance-sheet/export")
    @PreAuthorize("hasAuthority('report.export')")
    public ResponseEntity<byte[]> exportBalanceSheet(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
            @RequestParam(defaultValue = "pdf") String format) {
        return download(reportExportService.balanceSheet(branchId, asOf, format), "balance-sheet", format);
    }

    @GetMapping("/gst-summary/export")
    @PreAuthorize("hasAuthority('report.export')")
    public ResponseEntity<byte[]> exportGstSummary(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "pdf") String format) {
        return download(reportExportService.gstSummary(branchId, from, to, format), "gst-summary", format);
    }

    @GetMapping("/day-book/export")
    @PreAuthorize("hasAuthority('report.export')")
    public ResponseEntity<byte[]> exportDayBook(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "pdf") String format) {
        return download(reportExportService.dayBook(branchId, from, to, format), "day-book", format);
    }

    @GetMapping("/accounts/{id}/ledger/export")
    @PreAuthorize("hasAuthority('report.export')")
    public ResponseEntity<byte[]> exportLedger(
            @PathVariable Long id,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "pdf") String format) {
        return download(reportExportService.accountLedger(id, branchId, from, to, format),
                "account-ledger-" + id, format);
    }

    private ResponseEntity<byte[]> download(byte[] content, String filename, String format) {
        boolean excel = "xlsx".equalsIgnoreCase(format) || "excel".equalsIgnoreCase(format);
        MediaType type = excel
                ? MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                : MediaType.APPLICATION_PDF;
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(type);
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename(filename + (excel ? ".xlsx" : ".pdf")).build());
        headers.setContentLength(content.length);
        return ResponseEntity.ok().headers(headers).body(content);
    }
}
