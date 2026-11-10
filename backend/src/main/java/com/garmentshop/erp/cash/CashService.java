package com.garmentshop.erp.cash;

import com.garmentshop.erp.accounting.AccountingService;
import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.CashMovement;
import com.garmentshop.erp.domain.CashMovementType;
import com.garmentshop.erp.domain.CashSession;
import com.garmentshop.erp.domain.CashSessionStatus;
import com.garmentshop.erp.domain.JournalEntry;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.PaymentMethod;
import com.garmentshop.erp.domain.PaymentType;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.CashMovementRepository;
import com.garmentshop.erp.repository.CashSessionRepository;
import com.garmentshop.erp.repository.ExpenseRepository;
import com.garmentshop.erp.repository.InvoiceRepository;
import com.garmentshop.erp.repository.PaymentRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import com.garmentshop.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class CashService {

    private final CashSessionRepository sessionRepository;
    private final CashMovementRepository movementRepository;
    private final PaymentRepository paymentRepository;
    private final ExpenseRepository expenseRepository;
    private final InvoiceRepository invoiceRepository;
    private final BusinessRepository businessRepository;
    private final AccountingService accountingService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public CashDtos.SessionResponse current(Long branchId) {
        currentUserService.assertBranch(branchId);
        return sessionRepository.findFirstByBranchIdAndCashierIdAndStatusOrderByOpenedAtDesc(
                        branchId, currentUserService.userId(), CashSessionStatus.OPEN)
                .map(this::response).orElse(null);
    }

    @Transactional(readOnly = true)
    public List<CashDtos.SessionResponse> sessions(Long branchId, LocalDate from, LocalDate to) {
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        return sessionRepository.findByBusinessIdOrderByOpenedAtDesc(currentUserService.businessId()).stream()
                .filter(s -> branchId == null || s.getBranch().getId().equals(branchId))
                .filter(s -> from == null || !s.getOpenedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate().isBefore(from))
                .filter(s -> to == null || !s.getOpenedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate().isAfter(to))
                .map(this::response).toList();
    }

    @Transactional
    public CashDtos.SessionResponse open(CashDtos.OpenSessionRequest request) {
        currentUserService.requirePermission(Permissions.CASH_OPEN);
        Branch branch = currentUserService.branch(request.branchId());
        Long businessId = currentUserService.businessId();
        UserPrincipal principal = currentUserService.require();
        CashSession existing = sessionRepository.findFirstByBranchIdAndCashierIdAndStatusOrderByOpenedAtDesc(
                branch.getId(), principal.getId(), CashSessionStatus.OPEN).orElse(null);
        if (existing != null) {
            throw ApiException.conflict("SESSION_ALREADY_OPEN",
                    "You already have an open cash session in this branch.");
        }
        BigDecimal opening = Money.of(request.openingBalance());
        CashSession session = new CashSession();
        session.setBusinessId(businessId);
        session.setBranch(branch);
        session.setCashierId(principal.getId());
        session.setCashierName(principal.getFullName());
        session.setOpeningBalance(opening);
        session.setOpenedAt(Instant.now());
        session.setStatus(CashSessionStatus.OPEN);
        session.setNotes(blankToNull(request.notes()));
        sessionRepository.save(session);
        if (opening.signum() > 0) {
            CashMovement movement = new CashMovement();
            movement.setCashSession(session);
            movement.setType(CashMovementType.OPENING);
            movement.setAmount(opening);
            movement.setReference("Opening float");
            movement.setUserId(principal.getId());
            movementRepository.save(movement);
        }
        auditService.log("CASH_SESSION_OPENED", "CASH_SESSION", session.getId(), null,
                java.util.Map.of("openingBalance", opening, "branch", branch.getName()),
                "Cash session opened", branch.getId(), null);
        return response(session);
    }

    @Transactional
    public CashDtos.SessionResponse movement(Long sessionId, CashDtos.MovementRequest request) {
        currentUserService.requirePermission(Permissions.CASH_OPEN);
        CashSession session = session(sessionId);
        currentUserService.assertBranch(session.getBranch().getId());
        if (session.getStatus() != CashSessionStatus.OPEN) {
            throw ApiException.badRequest("SESSION_NOT_OPEN", "Cash movements require an open session.");
        }
        CashMovementType type = parseMovementType(request.type());
        if (type != CashMovementType.DEPOSIT && type != CashMovementType.WITHDRAWAL) {
            throw ApiException.badRequest("INVALID_MOVEMENT_TYPE", "Only deposits and withdrawals can be recorded manually.");
        }
        UserPrincipal principal = currentUserService.require();
        Business business = businessRepository.findById(currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        BigDecimal amount = Money.of(request.amount());
        CashMovement movement = new CashMovement();
        movement.setCashSession(session);
        movement.setType(type);
        movement.setAmount(amount);
        movement.setReference(blankToNull(request.reference()));
        movement.setNotes(blankToNull(request.notes()));
        movement.setUserId(principal.getId());
        movementRepository.save(movement);
        List<AccountingService.Line> lines = type == CashMovementType.DEPOSIT
                ? List.of(AccountingService.debit(AccountingService.CASH, amount, "Cash deposited"),
                        AccountingService.credit(AccountingService.OWNER_EQUITY, amount, "Owner cash deposit"))
                : List.of(AccountingService.debit(AccountingService.OWNER_EQUITY, amount, "Owner cash withdrawal"),
                        AccountingService.credit(AccountingService.CASH, amount, "Cash withdrawn"));
        accountingService.post(currentUserService.businessId(), session.getBranch(), LocalDate.now(),
                (type == CashMovementType.DEPOSIT ? "Cash deposit " : "Cash withdrawal ")
                        + (request.reference() == null ? "" : request.reference()),
                JournalSource.CASH_MOVEMENT, "CASH-SESSION-" + session.getId() + "-" + movement.getId(), lines,
                principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
        auditService.log("CASH_" + type.name(), "CASH_SESSION", session.getId(), null,
                java.util.Map.of("amount", amount), "Cash movement recorded", session.getBranch().getId(), null);
        return response(session);
    }

    @Transactional
    public CashDtos.SessionResponse close(Long sessionId, CashDtos.CloseSessionRequest request) {
        currentUserService.requirePermission(Permissions.CASH_CLOSE);
        CashSession session = session(sessionId);
        currentUserService.assertBranch(session.getBranch().getId());
        if (session.getStatus() != CashSessionStatus.OPEN) {
            throw ApiException.badRequest("SESSION_NOT_OPEN", "Only an open session can be closed.");
        }
        UserPrincipal principal = currentUserService.require();
        Totals totals = totals(session);
        BigDecimal expected = totals.expected(session.getOpeningBalance());
        BigDecimal actual = Money.of(request.actualClosing());
        BigDecimal difference = Money.of(actual.subtract(expected));
        if (difference.signum() != 0 && (request.discrepancyReason() == null || request.discrepancyReason().isBlank())) {
            throw ApiException.badRequest("DISCREPANCY_REASON_REQUIRED",
                    "A reason is required when the counted cash differs from expected cash.");
        }
        session.setExpectedClosing(expected);
        session.setActualClosing(actual);
        session.setDifference(difference);
        session.setClosedAt(Instant.now());
        session.setClosedBy(principal.getId());
        session.setNotes(blankToNull(request.notes()));
        session.setDiscrepancyReason(blankToNull(request.discrepancyReason()));
        boolean canApprove = principal.hasPermission(Permissions.CASH_APPROVE);
        if (difference.signum() != 0 && !canApprove) {
            session.setStatus(CashSessionStatus.PENDING_APPROVAL);
        } else {
            session.setStatus(CashSessionStatus.CLOSED);
            postDifference(session, difference, principal);
        }
        CashMovement closing = new CashMovement();
        closing.setCashSession(session);
        closing.setType(CashMovementType.CLOSING);
        closing.setAmount(actual);
        closing.setReference("Closing count");
        closing.setNotes(blankToNull(request.discrepancyReason()));
        closing.setUserId(principal.getId());
        movementRepository.save(closing);
        sessionRepository.save(session);
        auditService.log("CASH_SESSION_CLOSED", "CASH_SESSION", session.getId(),
                java.util.Map.of("status", "OPEN"),
                java.util.Map.of("status", session.getStatus().name(), "difference", difference),
                "Cash session closed", session.getBranch().getId(), null);
        return response(session);
    }

    @Transactional
    public CashDtos.SessionResponse approve(Long sessionId, CashDtos.ApproveSessionRequest request) {
        currentUserService.requirePermission(Permissions.CASH_APPROVE);
        CashSession session = session(sessionId);
        currentUserService.assertBranch(session.getBranch().getId());
        if (session.getStatus() != CashSessionStatus.PENDING_APPROVAL) {
            throw ApiException.badRequest("INVALID_SESSION_STATUS", "This session does not need approval.");
        }
        UserPrincipal principal = currentUserService.require();
        postDifference(session, Money.nz(session.getDifference()), principal);
        session.setStatus(CashSessionStatus.CLOSED);
        session.setApprovedBy(principal.getId());
        session.setApprovedAt(Instant.now());
        if (request != null && request.notes() != null && !request.notes().isBlank()) {
            session.setNotes(request.notes().trim());
        }
        sessionRepository.save(session);
        auditService.log("CASH_SESSION_APPROVED", "CASH_SESSION", session.getId(),
                java.util.Map.of("status", "PENDING_APPROVAL"), java.util.Map.of("status", "CLOSED"),
                "Cash discrepancy approved", session.getBranch().getId(), null);
        return response(session);
    }

    @Transactional(readOnly = true)
    public CashDtos.DailyClosingResponse dailyClosing(Long branchId, LocalDate date) {
        currentUserService.requirePermission(Permissions.CASH_VIEW);
        currentUserService.assertBranch(branchId);
        Long businessId = currentUserService.businessId();
        LocalDate day = date == null ? LocalDate.now() : date;
        Branch branch = currentUserService.branch(branchId);
        BigDecimal salesTotal = invoiceRepository.sumSales(businessId, branchId, day, day);
        BigDecimal refunds = paymentRepository.sumByType(businessId, branchId, PaymentType.CUSTOMER_REFUND, day, day);
        BigDecimal expenses = expenseRepository.cashExpenses(businessId, branchId, day, day);
        long invoiceCount = invoiceRepository.countByBusinessIdAndStatusAndInvoiceDateBetween(
                businessId, com.garmentshop.erp.domain.InvoiceStatus.POSTED, day, day);
        BigDecimal cashSales = paymentRepository.sumByTypeAndMethodForPeriod(businessId, branchId,
                PaymentType.CUSTOMER_RECEIPT, PaymentMethod.CASH, day, day);
        BigDecimal cashRefunds = paymentRepository.sumByTypeAndMethodForPeriod(businessId, branchId,
                PaymentType.CUSTOMER_REFUND, PaymentMethod.CASH, day, day);
        BigDecimal netCash = cashSales.subtract(cashRefunds).subtract(expenses);
        return new CashDtos.DailyClosingResponse(day, branchId, branch.getName(), salesTotal, cashSales,
                paymentRepository.sumByTypeAndMethodForPeriod(businessId, branchId,
                        PaymentType.CUSTOMER_RECEIPT, PaymentMethod.CARD, day, day),
                paymentRepository.sumByTypeAndMethodForPeriod(businessId, branchId,
                        PaymentType.CUSTOMER_RECEIPT, PaymentMethod.UPI, day, day),
                paymentRepository.sumByTypeAndMethodForPeriod(businessId, branchId,
                        PaymentType.CUSTOMER_RECEIPT, PaymentMethod.BANK, day, day)
                        .add(paymentRepository.sumByTypeAndMethodForPeriod(businessId, branchId,
                                PaymentType.CUSTOMER_RECEIPT, PaymentMethod.CHEQUE, day, day)),
                invoiceRepository.outstandingReceivables(businessId, branchId), refunds, expenses, netCash,
                invoiceCount);
    }

    // ---------- Internals ----------

    private void postDifference(CashSession session, BigDecimal difference, UserPrincipal principal) {
        if (difference.signum() == 0) {
            return;
        }
        Business business = businessRepository.findById(session.getBusinessId())
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        List<AccountingService.Line> lines = difference.signum() > 0
                ? List.of(AccountingService.debit(AccountingService.CASH, difference, "Cash over"),
                        AccountingService.credit(AccountingService.CASH_OVER_SHORT, difference, "Cash over"))
                : List.of(AccountingService.debit(AccountingService.CASH_OVER_SHORT, difference.abs(), "Cash short"),
                        AccountingService.credit(AccountingService.CASH, difference.abs(), "Cash short"));
        accountingService.post(session.getBusinessId(), session.getBranch(), LocalDate.now(),
                "Cash reconciliation for session " + session.getId(),
                JournalSource.CASH_MOVEMENT, "CASH-SESSION-" + session.getId() + "-CLOSE", lines,
                principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
    }

    private Totals totals(CashSession session) {
        BigDecimal receipts = Money.nz(paymentRepository.sumBySessionAndTypeAndMethod(
                session.getId(), PaymentType.CUSTOMER_RECEIPT, PaymentMethod.CASH));
        BigDecimal refunds = Money.nz(paymentRepository.sumBySessionAndTypeAndMethod(
                session.getId(), PaymentType.CUSTOMER_REFUND, PaymentMethod.CASH));
        BigDecimal expenses = Money.nz(movementRepository.sumBySessionAndType(
                session.getId(), CashMovementType.CASH_EXPENSE));
        BigDecimal deposits = Money.nz(movementRepository.sumBySessionAndType(
                session.getId(), CashMovementType.DEPOSIT));
        BigDecimal withdrawals = Money.nz(movementRepository.sumBySessionAndType(
                session.getId(), CashMovementType.WITHDRAWAL));
        return new Totals(receipts, refunds, expenses, deposits, withdrawals);
    }

    private CashSession session(Long id) {
        return sessionRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Cash session not found."));
    }

    private CashMovementType parseMovementType(String raw) {
        try {
            return CashMovementType.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_MOVEMENT_TYPE", "Unknown cash movement type.");
        }
    }

    private CashDtos.SessionResponse response(CashSession session) {
        Totals totals = totals(session);
        BigDecimal expected = session.getExpectedClosing() == null
                ? totals.expected(session.getOpeningBalance()) : session.getExpectedClosing();
        List<CashDtos.MovementResponse> movements = movementRepository
                .findByCashSessionIdOrderByIdAsc(session.getId()).stream()
                .map(m -> new CashDtos.MovementResponse(m.getId(), m.getType().name(), m.getAmount(),
                        m.getReference(), m.getNotes(), null, m.getCreatedAt()))
                .toList();
        return new CashDtos.SessionResponse(session.getId(), session.getBranch().getId(),
                session.getBranch().getName(), session.getCashierId(), session.getCashierName(),
                session.getOpeningBalance(), session.getOpenedAt(), session.getClosedAt(),
                totals.receipts(), totals.refunds(), totals.expenses(), totals.deposits(), totals.withdrawals(),
                expected, session.getActualClosing(), session.getDifference(), session.getStatus().name(),
                session.getNotes(), session.getDiscrepancyReason(), null, session.getApprovedAt(), movements);
    }

    private record Totals(BigDecimal receipts, BigDecimal refunds, BigDecimal expenses,
                          BigDecimal deposits, BigDecimal withdrawals) {
        BigDecimal expected(BigDecimal opening) {
            return Money.of(Money.nz(opening).add(receipts).subtract(refunds).subtract(expenses)
                    .add(deposits).subtract(withdrawals));
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
