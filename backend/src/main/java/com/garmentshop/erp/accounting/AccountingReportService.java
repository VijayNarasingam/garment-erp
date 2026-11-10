package com.garmentshop.erp.accounting;

import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.domain.Account;
import com.garmentshop.erp.domain.AccountType;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.EntryStatus;
import com.garmentshop.erp.domain.FinancialPeriod;
import com.garmentshop.erp.domain.JournalEntry;
import com.garmentshop.erp.domain.JournalLine;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.PeriodStatus;
import com.garmentshop.erp.repository.AccountRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.FinancialPeriodRepository;
import com.garmentshop.erp.repository.InvoiceItemRepository;
import com.garmentshop.erp.repository.JournalEntryRepository;
import com.garmentshop.erp.repository.JournalLineRepository;
import com.garmentshop.erp.repository.PurchaseInvoiceItemRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import com.garmentshop.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AccountingReportService {

    private final JournalLineRepository journalLineRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final AccountRepository accountRepository;
    private final FinancialPeriodRepository periodRepository;
    private final PurchaseInvoiceItemRepository purchaseInvoiceItemRepository;
    private final InvoiceItemRepository invoiceItemRepository;
    private final BusinessRepository businessRepository;
    private final AccountingService accountingService;
    private final CurrentUserService currentUserService;

    private static final LocalDate EPOCH = LocalDate.of(1900, 1, 1);

    // ---------- Chart of accounts ----------

    @Transactional(readOnly = true)
    public List<AccountingDtos.AccountResponse> accounts(boolean includeInactive) {
        Long businessId = currentUserService.businessId();
        List<Account> accounts = includeInactive
                ? accountRepository.findByBusinessIdOrderByCodeAsc(businessId)
                : accountRepository.findByBusinessIdAndActiveTrueOrderByCodeAsc(businessId);
        return accounts.stream().map(this::accountResponse).toList();
    }

    @Transactional
    public AccountingDtos.AccountResponse createAccount(AccountingDtos.CreateAccountRequest request) {
        currentUserService.requirePermission(Permissions.ACCOUNTING_MANAGE);
        Long businessId = currentUserService.businessId();
        if (accountRepository.existsByBusinessIdAndCode(businessId, request.code().trim())) {
            throw ApiException.conflict("DUPLICATE_ACCOUNT_CODE", "An account with this code already exists.");
        }
        AccountType type;
        try {
            type = AccountType.valueOf(request.type().trim().toUpperCase(Locale.ENGLISH));
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_ACCOUNT_TYPE", "Unknown account type.");
        }
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        if (request.parentId() != null) {
            accountRepository.findByIdAndBusinessId(request.parentId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Parent account not found."));
        }
        Account account = new Account();
        account.setBusiness(business);
        account.setCode(request.code().trim());
        account.setName(request.name().trim());
        account.setType(type);
        account.setSubtype(blankToNull(request.subtype()));
        account.setParentId(request.parentId());
        account.setCashBank(request.cashBank() != null && request.cashBank());
        account.setSystemAccount(false);
        account.setActive(true);
        accountRepository.save(account);
        return accountResponse(account);
    }

    // ---------- Financial periods ----------

    @Transactional(readOnly = true)
    public List<AccountingDtos.PeriodResponse> periods() {
        return periodRepository.findByBusinessIdOrderByStartDateDesc(currentUserService.businessId())
                .stream().map(this::periodResponse).toList();
    }

    @Transactional
    public AccountingDtos.PeriodResponse createPeriod(AccountingDtos.PeriodRequest request) {
        currentUserService.requirePermission(Permissions.ACCOUNTING_CLOSE);
        if (request.startDate().isAfter(request.endDate())) {
            throw ApiException.badRequest("INVALID_PERIOD", "The period start date must be before the end date.");
        }
        Long businessId = currentUserService.businessId();
        if (periodRepository.existsByBusinessIdAndStartDateLessThanEqualAndEndDateGreaterThanEqual(
                businessId, request.endDate(), request.startDate())) {
            throw ApiException.conflict("PERIOD_OVERLAP", "This period overlaps an existing financial period.");
        }
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        FinancialPeriod period = new FinancialPeriod();
        period.setBusiness(business);
        period.setName(request.name().trim());
        period.setStartDate(request.startDate());
        period.setEndDate(request.endDate());
        period.setStatus(PeriodStatus.OPEN);
        period.setNotes(blankToNull(request.notes()));
        periodRepository.save(period);
        return periodResponse(period);
    }

    @Transactional
    public AccountingDtos.PeriodResponse closePeriod(Long id) {
        currentUserService.requirePermission(Permissions.ACCOUNTING_CLOSE);
        FinancialPeriod period = period(id);
        if (period.getStatus() == PeriodStatus.CLOSED) {
            throw ApiException.badRequest("PERIOD_ALREADY_CLOSED", "This period is already closed.");
        }
        period.setStatus(PeriodStatus.CLOSED);
        period.setClosedBy(currentUserService.userId());
        period.setClosedAt(Instant.now());
        periodRepository.save(period);
        return periodResponse(period);
    }

    @Transactional
    public AccountingDtos.PeriodResponse reopenPeriod(Long id, String reason) {
        currentUserService.requirePermission(Permissions.ACCOUNTING_CLOSE);
        FinancialPeriod period = period(id);
        if (period.getStatus() == PeriodStatus.OPEN) {
            throw ApiException.badRequest("PERIOD_ALREADY_OPEN", "This period is already open.");
        }
        if (reason == null || reason.isBlank()) {
            throw ApiException.badRequest("REASON_REQUIRED", "A reason is required to reopen a closed period.");
        }
        period.setStatus(PeriodStatus.OPEN);
        period.setNotes((period.getNotes() == null ? "" : period.getNotes() + " | ")
                + "Reopened: " + reason.trim());
        periodRepository.save(period);
        return periodResponse(period);
    }

    // ---------- Journals ----------

    @Transactional(readOnly = true)
    public AccountingDtos.JournalResponse journal(Long id) {
        JournalEntry entry = journalEntryRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Journal entry not found."));
        currentUserService.assertBranch(entry.getBranch().getId());
        return journalResponse(entry);
    }

    @Transactional
    public AccountingDtos.JournalResponse manualJournal(AccountingDtos.ManualJournalRequest request) {
        currentUserService.requirePermission(Permissions.ACCOUNTING_MANAGE);
        Branch branch = currentUserService.branch(request.branchId());
        Business business = businessRepository.findById(currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        UserPrincipal principal = currentUserService.require();
        LocalDate date = request.entryDate() == null ? LocalDate.now() : request.entryDate();
        if (date.isAfter(LocalDate.now())) {
            throw ApiException.badRequest("FUTURE_JOURNAL_DATE", "Journal dates cannot be in the future.");
        }
        List<AccountingService.Line> lines = new ArrayList<>();
        for (AccountingDtos.JournalLineRequest line : request.lines()) {
            accountRepository.findByIdAndBusinessId(line.accountId(), currentUserService.businessId())
                    .orElseThrow(() -> ApiException.notFound("Ledger account not found."));
            lines.add(new AccountingService.Line(line.accountId(), null,
                    Money.of(line.debit()), Money.of(line.credit()), line.description(),
                    line.customerId(), line.supplierId()));
        }
        JournalEntry entry = accountingService.post(currentUserService.businessId(), branch, date,
                request.description().trim(), JournalSource.MANUAL,
                blankToNull(request.reference()), lines, principal.getId(), principal.getFullName(),
                business.getFinancialYearStartMonth());
        return journalResponse(entry);
    }

    // ---------- Trial balance ----------

    @Transactional(readOnly = true)
    public AccountingDtos.TrialBalanceResponse trialBalance(Long branchId, LocalDate from, LocalDate to) {
        currentUserService.requirePermission(Permissions.ACCOUNTING_VIEW);
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        LocalDate start = from == null ? EPOCH : from;
        LocalDate end = to == null ? LocalDate.now() : to;
        List<Object[]> raw = journalLineRepository.trialBalance(currentUserService.businessId(), branchId, start, end);
        List<AccountingDtos.TrialBalanceRow> rows = new ArrayList<>();
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        for (Object[] row : raw) {
            Long accountId = ((Number) row[0]).longValue();
            String code = (String) row[1];
            String name = (String) row[2];
            AccountType type = (AccountType) row[3];
            BigDecimal debit = Money.of((BigDecimal) row[4]);
            BigDecimal credit = Money.of((BigDecimal) row[5]);
            BigDecimal balance = switch (type) {
                case ASSET, EXPENSE -> debit.subtract(credit);
                default -> credit.subtract(debit);
            };
            rows.add(new AccountingDtos.TrialBalanceRow(accountId, code, name, type.name(), debit, credit,
                    Money.of(balance)));
            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);
        }
        return new AccountingDtos.TrialBalanceResponse(start, end, rows, Money.of(totalDebit),
                Money.of(totalCredit), Money.eq(totalDebit, totalCredit));
    }

    // ---------- Ledger ----------

    @Transactional(readOnly = true)
    public AccountingDtos.AccountLedgerResponse accountLedger(Long accountId, Long branchId, LocalDate from,
                                                              LocalDate to) {
        currentUserService.requirePermission(Permissions.ACCOUNTING_VIEW);
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        Long businessId = currentUserService.businessId();
        Account account = accountRepository.findByIdAndBusinessId(accountId, businessId)
                .orElseThrow(() -> ApiException.notFound("Ledger account not found."));
        LocalDate start = from == null ? EPOCH : from;
        LocalDate end = to == null ? LocalDate.now() : to;
        List<Object[]> openingRaw = journalLineRepository.trialBalance(businessId, branchId, EPOCH, start.minusDays(1));
        BigDecimal opening = BigDecimal.ZERO;
        for (Object[] row : openingRaw) {
            if (((Number) row[0]).longValue() == accountId) {
                BigDecimal debit = Money.of((BigDecimal) row[4]);
                BigDecimal credit = Money.of((BigDecimal) row[5]);
                opening = account.getType() == AccountType.ASSET || account.getType() == AccountType.EXPENSE
                        ? debit.subtract(credit) : credit.subtract(debit);
            }
        }
        List<Object[]> raw = journalLineRepository.accountLedger(businessId, accountId, branchId, start, end);
        List<AccountingDtos.LedgerRow> rows = new ArrayList<>();
        BigDecimal running = opening;
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        for (Object[] row : raw) {
            BigDecimal debit = Money.of((BigDecimal) row[6]);
            BigDecimal credit = Money.of((BigDecimal) row[7]);
            boolean assetOrExpense = account.getType() == AccountType.ASSET || account.getType() == AccountType.EXPENSE;
            running = running.add(assetOrExpense ? debit.subtract(credit) : credit.subtract(debit));
            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);
            rows.add(new AccountingDtos.LedgerRow((LocalDate) row[2], (String) row[1], (String) row[3],
                    (String) row[9], (String) row[8], debit, credit, Money.of(running)));
        }
        return new AccountingDtos.AccountLedgerResponse(account.getId(), account.getCode(), account.getName(),
                account.getType().name(), start, end, Money.of(opening), Money.of(totalDebit),
                Money.of(totalCredit), Money.of(running), rows);
    }

    // ---------- Profit & loss ----------

    @Transactional(readOnly = true)
    public AccountingDtos.ProfitLossResponse profitLoss(Long branchId, LocalDate from, LocalDate to) {
        currentUserService.requirePermission(Permissions.REPORT_VIEW);
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        LocalDate start = from == null ? LocalDate.now().withDayOfMonth(1) : from;
        LocalDate end = to == null ? LocalDate.now() : to;
        List<Object[]> raw = journalLineRepository.trialBalance(currentUserService.businessId(), branchId, start, end);
        List<AccountingDtos.ProfitLossLine> income = new ArrayList<>();
        List<AccountingDtos.ProfitLossLine> expenses = new ArrayList<>();
        BigDecimal totalIncome = BigDecimal.ZERO;
        BigDecimal totalExpenses = BigDecimal.ZERO;
        for (Object[] row : raw) {
            AccountType type = (AccountType) row[3];
            if (type != AccountType.INCOME && type != AccountType.EXPENSE) {
                continue;
            }
            BigDecimal debit = Money.of((BigDecimal) row[4]);
            BigDecimal credit = Money.of((BigDecimal) row[5]);
            if (type == AccountType.INCOME) {
                BigDecimal amount = Money.of(credit.subtract(debit));
                income.add(new AccountingDtos.ProfitLossLine((String) row[1], (String) row[2], amount));
                totalIncome = totalIncome.add(amount);
            } else {
                BigDecimal amount = Money.of(debit.subtract(credit));
                expenses.add(new AccountingDtos.ProfitLossLine((String) row[1], (String) row[2], amount));
                totalExpenses = totalExpenses.add(amount);
            }
        }
        income.sort(Comparator.comparing(AccountingDtos.ProfitLossLine::code));
        expenses.sort(Comparator.comparing(AccountingDtos.ProfitLossLine::code));
        return new AccountingDtos.ProfitLossResponse(start, end, income, expenses, Money.of(totalIncome),
                Money.of(totalExpenses), Money.of(totalIncome.subtract(totalExpenses)));
    }

    // ---------- Balance sheet ----------

    @Transactional(readOnly = true)
    public AccountingDtos.BalanceSheetResponse balanceSheet(Long branchId, LocalDate asOf) {
        currentUserService.requirePermission(Permissions.REPORT_VIEW);
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        LocalDate date = asOf == null ? LocalDate.now() : asOf;
        List<Object[]> raw = journalLineRepository.trialBalance(currentUserService.businessId(), branchId, EPOCH, date);
        List<AccountingDtos.ProfitLossLine> assets = new ArrayList<>();
        List<AccountingDtos.ProfitLossLine> liabilities = new ArrayList<>();
        List<AccountingDtos.ProfitLossLine> equity = new ArrayList<>();
        BigDecimal totalAssets = BigDecimal.ZERO;
        BigDecimal totalLiabilities = BigDecimal.ZERO;
        BigDecimal totalEquity = BigDecimal.ZERO;
        BigDecimal earnings = BigDecimal.ZERO;
        for (Object[] row : raw) {
            AccountType type = (AccountType) row[3];
            BigDecimal debit = Money.of((BigDecimal) row[4]);
            BigDecimal credit = Money.of((BigDecimal) row[5]);
            AccountingDtos.ProfitLossLine line = new AccountingDtos.ProfitLossLine((String) row[1],
                    (String) row[2], Money.ZERO);
            switch (type) {
                case ASSET -> {
                    BigDecimal amount = Money.of(debit.subtract(credit));
                    assets.add(new AccountingDtos.ProfitLossLine(line.code(), line.name(), amount));
                    totalAssets = totalAssets.add(amount);
                }
                case LIABILITY -> {
                    BigDecimal amount = Money.of(credit.subtract(debit));
                    liabilities.add(new AccountingDtos.ProfitLossLine(line.code(), line.name(), amount));
                    totalLiabilities = totalLiabilities.add(amount);
                }
                case EQUITY -> {
                    BigDecimal amount = Money.of(credit.subtract(debit));
                    equity.add(new AccountingDtos.ProfitLossLine(line.code(), line.name(), amount));
                    totalEquity = totalEquity.add(amount);
                }
                case INCOME -> earnings = earnings.add(credit.subtract(debit));
                case EXPENSE -> earnings = earnings.subtract(debit.subtract(credit));
            }
        }
        assets.sort(Comparator.comparing(AccountingDtos.ProfitLossLine::code));
        liabilities.sort(Comparator.comparing(AccountingDtos.ProfitLossLine::code));
        equity.sort(Comparator.comparing(AccountingDtos.ProfitLossLine::code));
        BigDecimal difference = Money.of(totalAssets.subtract(totalLiabilities).subtract(totalEquity)
                .subtract(earnings));
        return new AccountingDtos.BalanceSheetResponse(date, assets, liabilities, equity,
                Money.of(totalAssets), Money.of(totalLiabilities), Money.of(totalEquity),
                Money.of(earnings), difference);
    }

    // ---------- GST ----------

    @Transactional(readOnly = true)
    public AccountingDtos.GstSummaryResponse gstSummary(Long branchId, LocalDate from, LocalDate to) {
        currentUserService.requirePermission(Permissions.REPORT_VIEW);
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        LocalDate start = from == null ? LocalDate.now().withDayOfMonth(1) : from;
        LocalDate end = to == null ? LocalDate.now() : to;
        Long businessId = currentUserService.businessId();
        BigDecimal outputTax = accountBalance(businessId, branchId, AccountingService.OUTPUT_GST, start, end, true);
        BigDecimal inputTax = accountBalance(businessId, branchId, AccountingService.INPUT_GST, start, end, false);
        List<AccountingDtos.GstRateRow> sales = new ArrayList<>();
        for (Object[] row : invoiceItemRepository.gstSummary(businessId, branchId, start, end)) {
            sales.add(new AccountingDtos.GstRateRow(Money.of((BigDecimal) row[0]),
                    Money.of((BigDecimal) row[1]), Money.of((BigDecimal) row[2]),
                    ((Number) row[3]).longValue()));
        }
        List<AccountingDtos.GstRateRow> purchases = new ArrayList<>();
        for (Object[] row : purchaseInvoiceItemRepository.gstSummary(businessId, branchId, start, end)) {
            purchases.add(new AccountingDtos.GstRateRow(Money.of((BigDecimal) row[0]),
                    Money.of((BigDecimal) row[1]), Money.of((BigDecimal) row[2]),
                    ((Number) row[3]).longValue()));
        }
        return new AccountingDtos.GstSummaryResponse(start, end, Money.of(outputTax), Money.of(inputTax),
                Money.of(outputTax.subtract(inputTax)), sales, purchases);
    }

    private BigDecimal accountBalance(Long businessId, Long branchId, String code, LocalDate from, LocalDate to,
                                      boolean creditNormal) {
        Account account = accountRepository.findByBusinessIdAndCode(businessId, code).orElse(null);
        if (account == null) {
            return BigDecimal.ZERO;
        }
        List<Object[]> rows = journalLineRepository.trialBalance(businessId, branchId, from, to);
        for (Object[] row : rows) {
            if (((Number) row[0]).longValue() == account.getId()) {
                BigDecimal debit = Money.of((BigDecimal) row[4]);
                BigDecimal credit = Money.of((BigDecimal) row[5]);
                return creditNormal ? credit.subtract(debit) : debit.subtract(credit);
            }
        }
        return BigDecimal.ZERO;
    }

    // ---------- Day book ----------

    @Transactional(readOnly = true)
    public AccountingDtos.DayBookResponse dayBook(Long branchId, LocalDate from, LocalDate to) {
        currentUserService.requirePermission(Permissions.REPORT_VIEW);
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        LocalDate start = from == null ? LocalDate.now() : from;
        LocalDate end = to == null ? start : to;
        List<AccountingDtos.JournalResponse> entries = journalEntryRepository
                .findForPeriod(currentUserService.businessId(), branchId, start, end)
                .stream().map(this::journalResponse).toList();
        return new AccountingDtos.DayBookResponse(start, end, entries);
    }

    // ---------- Mapping ----------

    private FinancialPeriod period(Long id) {
        return periodRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Financial period not found."));
    }

    private AccountingDtos.AccountResponse accountResponse(Account account) {
        return new AccountingDtos.AccountResponse(account.getId(), account.getCode(), account.getName(),
                account.getType().name(), account.getSubtype(), account.isSystemAccount(), account.isCashBank(),
                account.isActive());
    }

    private AccountingDtos.PeriodResponse periodResponse(FinancialPeriod period) {
        return new AccountingDtos.PeriodResponse(period.getId(), period.getName(), period.getStartDate(),
                period.getEndDate(), period.getStatus().name(), null, period.getClosedAt(), period.getNotes());
    }

    private AccountingDtos.JournalResponse journalResponse(JournalEntry entry) {
        List<AccountingDtos.JournalLineResponse> lines = entry.getLines().stream()
                .map(line -> new AccountingDtos.JournalLineResponse(line.getId(), line.getAccount().getId(),
                        line.getAccount().getCode(), line.getAccount().getName(), line.getDebit(),
                        line.getCredit(), line.getDescription()))
                .toList();
        return new AccountingDtos.JournalResponse(entry.getId(), entry.getEntryNo(), entry.getEntryDate(),
                entry.getDescription(), entry.getSourceType().name(), entry.getSourceId(),
                entry.getStatus().name(), entry.getBranch().getName(), entry.getCreatedByName(),
                entry.getPostedAt(), lines);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
