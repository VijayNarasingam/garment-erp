package com.garmentshop.erp.accounting;

import com.garmentshop.erp.domain.Account;
import com.garmentshop.erp.domain.AccountType;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.EntryStatus;
import com.garmentshop.erp.domain.FinancialPeriod;
import com.garmentshop.erp.domain.JournalEntry;
import com.garmentshop.erp.domain.JournalLine;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.PeriodStatus;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.common.SequenceService;
import com.garmentshop.erp.repository.AccountRepository;
import com.garmentshop.erp.repository.FinancialPeriodRepository;
import com.garmentshop.erp.repository.JournalEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AccountingService {

    public static final String CASH = "1000";
    public static final String BANK = "1010";
    public static final String UPI = "1020";
    public static final String CARD = "1030";
    public static final String RECEIVABLE = "1100";
    public static final String INVENTORY = "1200";
    public static final String INPUT_GST = "1300";
    public static final String PAYABLE = "2000";
    public static final String OUTPUT_GST = "2100";
    public static final String CUSTOMER_ADVANCE = "2300";
    public static final String OWNER_EQUITY = "3000";
    public static final String RETAINED_EARNINGS = "3100";
    public static final String OPENING_BALANCE_EQUITY = "3200";
    public static final String SALES = "4000";
    public static final String SALES_RETURNS = "4100";
    public static final String OTHER_INCOME = "4300";
    public static final String ROUND_OFF = "4900";
    public static final String COGS = "5000";
    public static final String INVENTORY_SHRINKAGE = "5200";
    public static final String CASH_OVER_SHORT = "5300";
    public static final String DISCOUNTS_ALLOWED = "4200";

    private final AccountRepository accountRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final FinancialPeriodRepository financialPeriodRepository;
    private final SequenceService sequenceService;

    public Account account(Long businessId, String code) {
        return accountRepository.findByBusinessIdAndCode(businessId, code)
                .orElseThrow(() -> ApiException.badRequest("ACCOUNT_MISSING",
                        "Required ledger account " + code + " is not configured."));
    }

    public Account account(Long businessId, Long accountId) {
        return accountRepository.findByIdAndBusinessId(accountId, businessId)
                .orElseThrow(() -> ApiException.notFound("Ledger account not found."));
    }

    public List<Account> chartOfAccounts(Long businessId) {
        return accountRepository.findByBusinessIdOrderByCodeAsc(businessId);
    }

    @Transactional
    public JournalEntry post(Long businessId, Branch branch, LocalDate entryDate, String description,
                             JournalSource source, String sourceId, List<Line> lines,
                             Long userId, String userName, int financialYearStartMonth) {
        if (lines == null || lines.isEmpty()) {
            throw ApiException.badRequest("EMPTY_JOURNAL", "A journal entry requires at least two lines.");
        }
        FinancialPeriod period = financialPeriodRepository.findContaining(businessId, entryDate).orElse(null);
        if (period != null && period.getStatus() == PeriodStatus.CLOSED) {
            throw ApiException.badRequest("PERIOD_CLOSED",
                    "Financial period " + period.getName() + " is closed. Post a reversal or use an open period.");
        }
        BigDecimal debitTotal = BigDecimal.ZERO;
        BigDecimal creditTotal = BigDecimal.ZERO;
        List<JournalLine> journalLines = new ArrayList<>();
        for (Line line : lines) {
            if (line.debit().signum() < 0 || line.credit().signum() < 0) {
                throw ApiException.badRequest("INVALID_JOURNAL", "Debit and credit amounts cannot be negative.");
            }
            if (line.debit().signum() > 0 && line.credit().signum() > 0) {
                throw ApiException.badRequest("INVALID_JOURNAL", "A journal line cannot have both debit and credit.");
            }
            if (line.debit().signum() == 0 && line.credit().signum() == 0) {
                continue;
            }
            Account account = line.accountId() != null
                    ? account(businessId, line.accountId())
                    : account(businessId, line.accountCode());
            JournalLine journalLine = new JournalLine();
            journalLine.setAccount(account);
            journalLine.setDebit(Money.of(line.debit()));
            journalLine.setCredit(Money.of(line.credit()));
            journalLine.setDescription(line.description());
            journalLine.setCustomerId(line.customerId());
            journalLine.setSupplierId(line.supplierId());
            journalLines.add(journalLine);
            debitTotal = debitTotal.add(journalLine.getDebit());
            creditTotal = creditTotal.add(journalLine.getCredit());
        }
        if (journalLines.size() < 2) {
            throw ApiException.badRequest("EMPTY_JOURNAL", "A journal entry requires at least two non-zero lines.");
        }
        if (!Money.eq(debitTotal, creditTotal)) {
            throw ApiException.badRequest("UNBALANCED_JOURNAL",
                    "Journal does not balance. Debits " + debitTotal + " vs credits " + creditTotal + ".");
        }
        FinancialYear financialYear = FinancialYear.of(entryDate, financialYearStartMonth);
        JournalEntry entry = new JournalEntry();
        entry.setBusinessId(businessId);
        entry.setBranch(branch);
        entry.setEntryDate(entryDate);
        entry.setDescription(description);
        entry.setSourceType(source);
        entry.setSourceId(sourceId);
        entry.setStatus(EntryStatus.POSTED);
        entry.setCreatedBy(userId);
        entry.setCreatedByName(userName);
        entry.setPostedAt(Instant.now());
        entry.setFinancialPeriodId(period == null ? null : period.getId());
        entry.setEntryNo(sequenceService.next(businessId, "JOURNAL", "JE", financialYear.label()));
        journalLines.forEach(line -> {
            line.setJournalEntry(entry);
            entry.getLines().add(line);
        });
        return journalEntryRepository.save(entry);
    }

    @Transactional
    public JournalEntry reverse(Long businessId, JournalEntry original, String reason, Long userId,
                                String userName, int financialYearStartMonth) {
        if (original.getStatus() == EntryStatus.REVERSED) {
            throw ApiException.badRequest("ALREADY_REVERSED", "This journal entry has already been reversed.");
        }
        List<Line> reversedLines = original.getLines().stream()
                .map(line -> new Line(line.getAccount().getId(), null, line.getCredit(), line.getDebit(),
                        "Reversal: " + (line.getDescription() == null ? original.getDescription() : line.getDescription()),
                        line.getCustomerId(), line.getSupplierId()))
                .toList();
        JournalEntry reversal = post(businessId, original.getBranch(), LocalDate.now(),
                "Reversal of " + original.getEntryNo() + ": " + reason, JournalSource.REVERSAL,
                original.getEntryNo(), reversedLines, userId, userName, financialYearStartMonth);
        reversal.setReversalOfId(original.getId());
        original.setStatus(EntryStatus.REVERSED);
        journalEntryRepository.save(original);
        return reversal;
    }

    public static Line debit(String accountCode, BigDecimal amount, String description) {
        return new Line(null, accountCode, amount, BigDecimal.ZERO, description, null, null);
    }

    public static Line credit(String accountCode, BigDecimal amount, String description) {
        return new Line(null, accountCode, BigDecimal.ZERO, amount, description, null, null);
    }

    public static Line debitAccount(Long accountId, BigDecimal amount, String description) {
        return new Line(accountId, null, amount, BigDecimal.ZERO, description, null, null);
    }

    public static Line creditAccount(Long accountId, BigDecimal amount, String description) {
        return new Line(accountId, null, BigDecimal.ZERO, amount, description, null, null);
    }

    public record Line(Long accountId, String accountCode, BigDecimal debit, BigDecimal credit,
                       String description, Long customerId, Long supplierId) {
    }
}
