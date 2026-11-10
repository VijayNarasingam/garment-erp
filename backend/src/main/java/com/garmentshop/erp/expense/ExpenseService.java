package com.garmentshop.erp.expense;

import com.garmentshop.erp.accounting.AccountingService;
import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.common.PageResponse;
import com.garmentshop.erp.common.SequenceService;
import com.garmentshop.erp.domain.Account;
import com.garmentshop.erp.domain.AccountType;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.CashMovement;
import com.garmentshop.erp.domain.CashMovementType;
import com.garmentshop.erp.domain.CashSession;
import com.garmentshop.erp.domain.CashSessionStatus;
import com.garmentshop.erp.domain.Expense;
import com.garmentshop.erp.domain.ExpenseCategory;
import com.garmentshop.erp.domain.ExpenseStatus;
import com.garmentshop.erp.domain.JournalEntry;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.PaymentMethod;
import com.garmentshop.erp.repository.AccountRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.CashMovementRepository;
import com.garmentshop.erp.repository.CashSessionRepository;
import com.garmentshop.erp.repository.ExpenseCategoryRepository;
import com.garmentshop.erp.repository.ExpenseRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import com.garmentshop.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class ExpenseService {

    private final ExpenseRepository expenseRepository;
    private final ExpenseCategoryRepository categoryRepository;
    private final AccountRepository accountRepository;
    private final BusinessRepository businessRepository;
    private final CashSessionRepository cashSessionRepository;
    private final CashMovementRepository cashMovementRepository;
    private final AccountingService accountingService;
    private final SequenceService sequenceService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    // ---------- Categories ----------

    @Transactional(readOnly = true)
    public List<ExpenseDtos.CategoryResponse> categories() {
        return categoryRepository.findByBusinessIdAndActiveTrueOrderByNameAsc(currentUserService.businessId())
                .stream().map(this::categoryResponse).toList();
    }

    @Transactional
    public ExpenseDtos.CategoryResponse createCategory(ExpenseDtos.SaveCategoryRequest request) {
        currentUserService.requirePermission(Permissions.EXPENSE_MANAGE);
        Long businessId = currentUserService.businessId();
        if (categoryRepository.existsByBusinessIdAndNameIgnoreCase(businessId, request.name().trim())) {
            throw ApiException.conflict("DUPLICATE_CATEGORY", "An expense category with this name already exists.");
        }
        Account account = accountRepository.findByIdAndBusinessId(request.accountId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Ledger account not found."));
        if (account.getType() != AccountType.EXPENSE) {
            throw ApiException.badRequest("INVALID_ACCOUNT", "Expense categories must map to an expense ledger account.");
        }
        ExpenseCategory category = new ExpenseCategory();
        category.setBusiness(account.getBusiness());
        category.setName(request.name().trim());
        category.setAccount(account);
        category.setActive(request.active() == null || request.active());
        categoryRepository.save(category);
        auditService.log("EXPENSE_CATEGORY_CREATED", "EXPENSE_CATEGORY", category.getId(), null,
                java.util.Map.of("name", category.getName(), "account", account.getCode()),
                "Expense category created", null, null);
        return categoryResponse(category);
    }

    @Transactional
    public ExpenseDtos.CategoryResponse updateCategory(Long id, ExpenseDtos.SaveCategoryRequest request) {
        currentUserService.requirePermission(Permissions.EXPENSE_MANAGE);
        Long businessId = currentUserService.businessId();
        ExpenseCategory category = categoryRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Expense category not found."));
        Account account = accountRepository.findByIdAndBusinessId(request.accountId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Ledger account not found."));
        if (account.getType() != AccountType.EXPENSE) {
            throw ApiException.badRequest("INVALID_ACCOUNT", "Expense categories must map to an expense ledger account.");
        }
        category.setName(request.name().trim());
        category.setAccount(account);
        if (request.active() != null) {
            category.setActive(request.active());
        }
        categoryRepository.save(category);
        auditService.log("EXPENSE_CATEGORY_UPDATED", "EXPENSE_CATEGORY", id, null,
                java.util.Map.of("name", category.getName(), "active", category.isActive()),
                "Expense category updated", null, null);
        return categoryResponse(category);
    }

    // ---------- Expenses ----------

    @Transactional(readOnly = true)
    public PageResponse<ExpenseDtos.ExpenseResponse> expenses(Long branchId, String status, LocalDate from,
                                                              LocalDate to, int page, int size) {
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        ExpenseStatus parsed = status == null || status.isBlank() ? null : parseStatus(status);
        Page<Expense> result = expenseRepository.search(currentUserService.businessId(), branchId, parsed, from, to,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                        Sort.by(Sort.Direction.DESC, "expenseDate").and(Sort.by(Sort.Direction.DESC, "id"))));
        return PageResponse.of(result, this::response);
    }

    @Transactional(readOnly = true)
    public ExpenseDtos.ExpenseResponse expense(Long id) {
        Expense expense = expenseRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Expense not found."));
        currentUserService.assertBranch(expense.getBranch().getId());
        return response(expense);
    }

    @Transactional
    public ExpenseDtos.ExpenseResponse create(ExpenseDtos.CreateExpenseRequest request) {
        currentUserService.requirePermission(Permissions.EXPENSE_MANAGE);
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(request.branchId());
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        ExpenseCategory category = categoryRepository.findByIdAndBusinessId(request.categoryId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Expense category not found."));
        if (!category.isActive()) {
            throw ApiException.badRequest("CATEGORY_INACTIVE", "This expense category is inactive.");
        }
        PaymentMethod method = parseMethod(request.paymentMethod());
        LocalDate expenseDate = request.expenseDate() == null ? LocalDate.now() : request.expenseDate();
        if (expenseDate.isAfter(LocalDate.now())) {
            throw ApiException.badRequest("FUTURE_EXPENSE_DATE", "Expense dates cannot be in the future.");
        }
        UserPrincipal principal = currentUserService.require();
        Expense expense = new Expense();
        expense.setBusinessId(businessId);
        expense.setBranch(branch);
        expense.setCategory(category);
        expense.setExpenseNo(sequenceService.next(businessId, "EXPENSE", "EXP",
                FinancialYear.of(expenseDate, business.getFinancialYearStartMonth()).label()));
        expense.setExpenseDate(expenseDate);
        expense.setAmount(Money.of(request.amount()));
        expense.setPaymentMethod(method);
        expense.setDescription(request.description().trim());
        expense.setAttachmentUrl(blankToNull(request.attachmentUrl()));
        expense.setNotes(blankToNull(request.notes()));
        expense.setRequestedBy(principal.getId());
        expense.setStatus(principal.hasPermission(Permissions.EXPENSE_APPROVE)
                ? ExpenseStatus.POSTED : ExpenseStatus.PENDING);
        expenseRepository.save(expense);
        if (expense.getStatus() == ExpenseStatus.POSTED) {
            post(expense, business, principal);
        }
        auditService.log("EXPENSE_CREATED", "EXPENSE", expense.getId(), null,
                java.util.Map.of("expenseNo", expense.getExpenseNo(), "amount", expense.getAmount(),
                        "status", expense.getStatus().name()), "Expense recorded", branch.getId(), null);
        return response(expense);
    }

    @Transactional
    public ExpenseDtos.ExpenseResponse approve(Long id) {
        currentUserService.requirePermission(Permissions.EXPENSE_APPROVE);
        Expense expense = expenseRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Expense not found."));
        currentUserService.assertBranch(expense.getBranch().getId());
        if (expense.getStatus() != ExpenseStatus.PENDING && expense.getStatus() != ExpenseStatus.APPROVED) {
            throw ApiException.badRequest("INVALID_EXPENSE_STATUS", "Only pending expenses can be approved.");
        }
        UserPrincipal principal = currentUserService.require();
        Business business = businessRepository.findById(currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        expense.setStatus(ExpenseStatus.APPROVED);
        expense.setApprovedBy(principal.getId());
        expense.setApprovedAt(Instant.now());
        post(expense, business, principal);
        auditService.log("EXPENSE_APPROVED", "EXPENSE", id, java.util.Map.of("status", "PENDING"),
                java.util.Map.of("status", "POSTED"), "Expense approved and posted",
                expense.getBranch().getId(), null);
        return response(expense);
    }

    @Transactional
    public ExpenseDtos.ExpenseResponse reject(Long id, ExpenseDtos.RejectExpenseRequest request) {
        currentUserService.requirePermission(Permissions.EXPENSE_APPROVE);
        Expense expense = expenseRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Expense not found."));
        currentUserService.assertBranch(expense.getBranch().getId());
        if (expense.getStatus() != ExpenseStatus.PENDING) {
            throw ApiException.badRequest("INVALID_EXPENSE_STATUS", "Only pending expenses can be rejected.");
        }
        expense.setStatus(ExpenseStatus.REJECTED);
        expense.setRejectionReason(request.reason().trim());
        expenseRepository.save(expense);
        auditService.log("EXPENSE_REJECTED", "EXPENSE", id, java.util.Map.of("status", "PENDING"),
                java.util.Map.of("status", "REJECTED"), request.reason(), expense.getBranch().getId(), null);
        return response(expense);
    }

    private void post(Expense expense, Business business, UserPrincipal principal) {
        if (expense.getJournalEntryId() != null) {
            throw ApiException.badRequest("EXPENSE_ALREADY_POSTED", "This expense has already been posted.");
        }
        String creditAccount = assetAccount(expense.getPaymentMethod());
        JournalEntry journal = accountingService.post(expense.getBusinessId(), expense.getBranch(),
                expense.getExpenseDate(),
                "Expense " + expense.getExpenseNo() + ": " + expense.getDescription(),
                JournalSource.EXPENSE, expense.getExpenseNo(),
                List.of(AccountingService.debitAccount(expense.getCategory().getAccount().getId(),
                                expense.getAmount(), expense.getDescription()),
                        AccountingService.credit(creditAccount, expense.getAmount(),
                                "Expense paid (" + expense.getPaymentMethod() + ")")),
                principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
        expense.setJournalEntryId(journal.getId());
        expense.setStatus(ExpenseStatus.POSTED);
        if (expense.getPaymentMethod() == PaymentMethod.CASH) {
            cashSessionRepository.findFirstByBranchIdAndCashierIdAndStatusOrderByOpenedAtDesc(
                            expense.getBranch().getId(), principal.getId(), CashSessionStatus.OPEN)
                    .ifPresent(session -> {
                        expense.setCashSessionId(session.getId());
                        CashMovement movement = new CashMovement();
                        movement.setCashSession(session);
                        movement.setType(CashMovementType.CASH_EXPENSE);
                        movement.setAmount(expense.getAmount());
                        movement.setReference(expense.getExpenseNo());
                        movement.setNotes(expense.getDescription());
                        movement.setUserId(principal.getId());
                        movement.setExpenseId(expense.getId());
                        cashMovementRepository.save(movement);
                    });
        }
        expenseRepository.save(expense);
    }

    private String assetAccount(PaymentMethod method) {
        return switch (method) {
            case CASH -> AccountingService.CASH;
            case UPI -> AccountingService.UPI;
            case CARD -> AccountingService.CARD;
            case BANK, CHEQUE -> AccountingService.BANK;
            default -> throw ApiException.badRequest("INVALID_PAYMENT_METHOD",
                    "Expenses must be paid by cash, bank, UPI, card or cheque.");
        };
    }

    private PaymentMethod parseMethod(String raw) {
        try {
            PaymentMethod method = PaymentMethod.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
            if (method == PaymentMethod.CREDIT || method == PaymentMethod.ADVANCE) {
                throw ApiException.badRequest("INVALID_PAYMENT_METHOD",
                        "Expenses must be paid by cash, bank, UPI, card or cheque.");
            }
            return method;
        } catch (ApiException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_PAYMENT_METHOD", "Unsupported payment method.");
        }
    }

    private ExpenseStatus parseStatus(String raw) {
        try {
            return ExpenseStatus.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_EXPENSE_STATUS", "Unknown expense status.");
        }
    }

    private ExpenseDtos.CategoryResponse categoryResponse(ExpenseCategory category) {
        return new ExpenseDtos.CategoryResponse(category.getId(), category.getName(),
                category.getAccount().getId(), category.getAccount().getCode(), category.getAccount().getName(),
                category.isActive());
    }

    private ExpenseDtos.ExpenseResponse response(Expense expense) {
        String requestedByName = null;
        return new ExpenseDtos.ExpenseResponse(expense.getId(), expense.getExpenseNo(),
                expense.getBranch().getId(), expense.getBranch().getName(), expense.getCategory().getId(),
                expense.getCategory().getName(), expense.getExpenseDate(), expense.getAmount(),
                expense.getPaymentMethod().name(), expense.getDescription(), expense.getAttachmentUrl(),
                expense.getStatus().name(), requestedByName, null, expense.getApprovedAt(),
                expense.getRejectionReason(), expense.getJournalEntryId(), expense.getCashSessionId(),
                expense.getNotes(), expense.getCreatedAt());
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
