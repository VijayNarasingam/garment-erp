package com.garmentshop.erp.returns;

import com.garmentshop.erp.accounting.AccountingService;
import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.common.PageResponse;
import com.garmentshop.erp.common.SequenceService;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.Invoice;
import com.garmentshop.erp.domain.InvoiceItem;
import com.garmentshop.erp.domain.InvoiceStatus;
import com.garmentshop.erp.domain.JournalEntry;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.Payment;
import com.garmentshop.erp.domain.PaymentMethod;
import com.garmentshop.erp.domain.PaymentType;
import com.garmentshop.erp.domain.ReturnStatus;
import com.garmentshop.erp.domain.ReturnType;
import com.garmentshop.erp.domain.SalesReturn;
import com.garmentshop.erp.domain.SalesReturnItem;
import com.garmentshop.erp.domain.StockMovementType;
import com.garmentshop.erp.inventory.StockLedger;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.CashSessionRepository;
import com.garmentshop.erp.repository.InvoiceItemRepository;
import com.garmentshop.erp.repository.InvoiceRepository;
import com.garmentshop.erp.repository.PaymentRepository;
import com.garmentshop.erp.repository.SalesReturnRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import com.garmentshop.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class ReturnService {

    private final SalesReturnRepository returnRepository;
    private final InvoiceRepository invoiceRepository;
    private final InvoiceItemRepository invoiceItemRepository;
    private final PaymentRepository paymentRepository;
    private final BusinessRepository businessRepository;
    private final CashSessionRepository cashSessionRepository;
    private final StockLedger stockLedger;
    private final AccountingService accountingService;
    private final SequenceService sequenceService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public PageResponse<ReturnDtos.ReturnResponse> list(Long branchId, String status, String search,
                                                        int page, int size) {
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        ReturnStatus parsed = status == null || status.isBlank() ? null : parseStatus(status);
        String term = search == null || search.isBlank() ? null : search.trim();
        Page<SalesReturn> result = returnRepository.search(currentUserService.businessId(), branchId, parsed, term,
                PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100)));
        return PageResponse.of(result, this::response);
    }

    @Transactional(readOnly = true)
    public ReturnDtos.ReturnSummary summary(Long branchId) {
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        long total = 0;
        long pending = 0;
        long approved = 0;
        long completed = 0;
        long rejected = 0;
        long cancelled = 0;
        BigDecimal completedValue = BigDecimal.ZERO;
        for (Object[] row : returnRepository.summary(currentUserService.businessId(), branchId)) {
            ReturnStatus rowStatus = (ReturnStatus) row[0];
            long count = ((Number) row[1]).longValue();
            total += count;
            switch (rowStatus) {
                case PENDING -> pending = count;
                case APPROVED -> approved = count;
                case COMPLETED -> {
                    completed = count;
                    completedValue = Money.of((BigDecimal) row[2]);
                }
                case REJECTED -> rejected = count;
                case CANCELLED -> cancelled = count;
            }
        }
        return new ReturnDtos.ReturnSummary(total, pending, approved, completed, rejected, cancelled, completedValue);
    }

    @Transactional(readOnly = true)
    public ReturnDtos.ReturnResponse get(Long id) {
        SalesReturn salesReturn = find(id);
        currentUserService.assertBranch(salesReturn.getBranch().getId());
        return response(salesReturn);
    }

    @Transactional
    public ReturnDtos.ReturnResponse create(ReturnDtos.CreateReturnRequest request) {
        currentUserService.requirePermission(Permissions.POS_RETURN);
        Long businessId = currentUserService.businessId();
        String offlineId = blankToNull(request.offlineId());
        if (offlineId != null) {
            SalesReturn existing = returnRepository.findByOfflineId(offlineId).orElse(null);
            if (existing != null) {
                if (!Objects.equals(existing.getBusinessId(), businessId)) {
                    throw ApiException.conflict("OFFLINE_ID_CONFLICT", "This offline return ID belongs to another business.");
                }
                return response(existing);
            }
        }
        Branch branch = currentUserService.branch(request.branchId());
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        Invoice invoice = invoiceRepository.findByIdAndBusinessId(request.invoiceId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Invoice not found."));
        if (!invoice.getBranch().getId().equals(branch.getId())) {
            throw ApiException.badRequest("BRANCH_MISMATCH", "The invoice belongs to another branch.");
        }
        if (invoice.getStatus() != InvoiceStatus.POSTED) {
            throw ApiException.badRequest("INVOICE_NOT_POSTED", "Only posted invoices can be returned.");
        }
        ReturnType type = parseType(request.type());
        LocalDate returnDate = request.returnDate() == null ? LocalDate.now() : request.returnDate();
        if (returnDate.isAfter(LocalDate.now())) {
            throw ApiException.badRequest("FUTURE_RETURN_DATE", "Return dates cannot be in the future.");
        }
        if (returnDate.isBefore(invoice.getInvoiceDate())) {
            throw ApiException.badRequest("RETURN_BEFORE_INVOICE", "The return date cannot be before the invoice date.");
        }
        int windowDays = type == ReturnType.EXCHANGE ? business.getExchangeWindowDays() : business.getReturnWindowDays();
        if (returnDate.isAfter(invoice.getInvoiceDate().plusDays(windowDays))) {
            throw ApiException.badRequest("RETURN_WINDOW_EXPIRED",
                    "This invoice is outside the " + windowDays + "-day " + type.name().toLowerCase(Locale.ENGLISH) + " window.");
        }

        Map<Long, InvoiceItem> invoiceItems = new HashMap<>();
        for (InvoiceItem item : invoice.getItems()) {
            invoiceItems.put(item.getId(), item);
        }
        UserPrincipal principal = currentUserService.require();
        boolean canApprove = principal.hasPermission(Permissions.RETURN_APPROVE);
        if (type == ReturnType.EXCHANGE && business.isReturnApprovalRequired() && !canApprove) {
            // An exchange consumes the return credit immediately on the replacement invoice.
            // Leaving the return pending would post the invoice without restock or ledger entries.
            throw ApiException.forbidden("EXCHANGE_APPROVAL_REQUIRED",
                    "An exchange must be approved by a manager with return approval rights.");
        }
        SalesReturn salesReturn = new SalesReturn();
        salesReturn.setBusinessId(businessId);
        salesReturn.setBranch(branch);
        salesReturn.setInvoice(invoice);
        salesReturn.setCustomer(invoice.getCustomer());
        salesReturn.setReturnNo(sequenceService.next(businessId, "SALES_RETURN", "SRT",
                FinancialYear.of(returnDate, business.getFinancialYearStartMonth()).label()));
        salesReturn.setReturnDate(returnDate);
        salesReturn.setType(type);
        salesReturn.setStatus(ReturnStatus.PENDING);
        salesReturn.setReason(request.reason().trim());
        salesReturn.setConditionNotes(blankToNull(request.conditionNotes()));
        salesReturn.setRestock(request.restock() == null || request.restock());
        salesReturn.setRequestedBy(principal.getId());
        salesReturn.setRequestedByName(principal.getFullName());
        salesReturn.setDeviceId(blankToNull(request.deviceId()));
        salesReturn.setOfflineId(offlineId);
        salesReturn.setSource(offlineId != null || request.deviceId() != null ? "OFFLINE" : "ONLINE");
        if (request.refundMethod() != null && !request.refundMethod().isBlank()) {
            salesReturn.setRefundMethod(parseRefundMethod(request.refundMethod()));
        } else if (type == ReturnType.EXCHANGE) {
            salesReturn.setRefundMethod(PaymentMethod.ADVANCE);
        }
        salesReturn.setRefundReference(blankToNull(request.refundReference()));

        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal taxTotal = BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal costAmount = BigDecimal.ZERO;
        Map<Long, Boolean> seen = new HashMap<>();
        for (ReturnDtos.ReturnItemRequest itemRequest : request.items()) {
            if (seen.put(itemRequest.invoiceItemId(), true) != null) {
                throw ApiException.badRequest("DUPLICATE_ITEM", "Each invoice line can appear only once in a return.");
            }
            InvoiceItem invoiceItem = invoiceItems.get(itemRequest.invoiceItemId());
            if (invoiceItem == null) {
                throw ApiException.badRequest("ITEM_NOT_ON_INVOICE", "The selected line does not belong to this invoice.");
            }
            int available = invoiceItem.getQuantity() - invoiceItem.getReturnedQuantity();
            if (itemRequest.quantity() > available) {
                throw ApiException.badRequest("OVER_RETURN",
                        "Returning " + itemRequest.quantity() + " of " + invoiceItem.getSku()
                                + " exceeds the unreturned quantity " + available + ".");
            }
            SalesReturnItem item = new SalesReturnItem();
            item.setSalesReturn(salesReturn);
            item.setInvoiceItem(invoiceItem);
            item.setVariant(invoiceItem.getVariant());
            item.setQuantity(itemRequest.quantity());
            item.setUnitPrice(invoiceItem.getUnitPrice());
            item.setTaxRate(invoiceItem.getTaxRate());
            item.setTaxableAmount(proportional(invoiceItem.getTaxableAmount(), invoiceItem.getQuantity(),
                    itemRequest.quantity()));
            item.setTaxAmount(proportional(invoiceItem.getTaxAmount(), invoiceItem.getQuantity(),
                    itemRequest.quantity()));
            item.setLineTotal(proportional(invoiceItem.getLineTotal(), invoiceItem.getQuantity(),
                    itemRequest.quantity()));
            item.setCostPrice(invoiceItem.getCostPrice());
            item.setCostAmount(Money.of(invoiceItem.getCostPrice().multiply(BigDecimal.valueOf(itemRequest.quantity()))));
            item.setRestockItem(itemRequest.restockItem() == null
                    ? salesReturn.isRestock() : itemRequest.restockItem());
            item.setConditionNote(blankToNull(itemRequest.conditionNote()));
            salesReturn.getItems().add(item);
            subtotal = subtotal.add(item.getTaxableAmount());
            taxTotal = taxTotal.add(item.getTaxAmount());
            total = total.add(item.getLineTotal());
            if (item.isRestockItem()) {
                costAmount = costAmount.add(item.getCostAmount());
            }
        }
        salesReturn.setSubtotal(Money.of(subtotal));
        salesReturn.setTaxTotal(Money.of(taxTotal));
        salesReturn.setTotal(Money.of(total));
        salesReturn.setCostAmount(Money.of(costAmount));
        BigDecimal refundAmount = request.refundAmount() == null
                ? (salesReturn.getRefundMethod() == null ? BigDecimal.ZERO : total)
                : Money.of(request.refundAmount());
        if (type == ReturnType.EXCHANGE && refundAmount.signum() > 0) {
            throw ApiException.badRequest("EXCHANGE_NO_REFUND",
                    "An exchange cannot include a refund. Apply the credit to the replacement bill.");
        }
        salesReturn.setRefundAmount(refundAmount);
        returnRepository.save(salesReturn);

        if (business.isReturnApprovalRequired() && !canApprove) {
            auditService.log("SALES_RETURN_REQUESTED", "SALES_RETURN", salesReturn.getId(), null,
                    Map.of("returnNo", salesReturn.getReturnNo(), "total", salesReturn.getTotal()),
                    "Sales return requested", branch.getId(), salesReturn.getDeviceId());
        } else {
            salesReturn.setStatus(ReturnStatus.APPROVED);
            salesReturn.setApprovedBy(principal.getId());
            salesReturn.setApprovedByName(principal.getFullName());
            salesReturn.setApprovedAt(Instant.now());
            completeInternal(salesReturn, business, principal, request.refundMethod(), request.refundAmount(),
                    request.refundReference(), "Auto-approved at POS");
        }
        return response(salesReturn);
    }

    @Transactional
    public ReturnDtos.ReturnResponse approve(Long id, ReturnDtos.ApproveReturnRequest request) {
        currentUserService.requirePermission(Permissions.RETURN_APPROVE);
        SalesReturn salesReturn = find(id);
        currentUserService.assertBranch(salesReturn.getBranch().getId());
        if (salesReturn.getStatus() != ReturnStatus.PENDING) {
            throw ApiException.badRequest("INVALID_RETURN_STATUS", "Only pending returns can be approved.");
        }
        UserPrincipal principal = currentUserService.require();
        salesReturn.setStatus(ReturnStatus.APPROVED);
        salesReturn.setApprovedBy(principal.getId());
        salesReturn.setApprovedByName(principal.getFullName());
        salesReturn.setApprovedAt(Instant.now());
        if (request != null && request.notes() != null && !request.notes().isBlank()) {
            salesReturn.setConditionNotes(request.notes().trim());
        }
        returnRepository.save(salesReturn);
        auditService.log("SALES_RETURN_APPROVED", "SALES_RETURN", id,
                Map.of("status", "PENDING"), Map.of("status", "APPROVED"),
                "Sales return approved", salesReturn.getBranch().getId(), salesReturn.getDeviceId());
        return response(salesReturn);
    }

    @Transactional
    public ReturnDtos.ReturnResponse reject(Long id, ReturnDtos.RejectReturnRequest request) {
        currentUserService.requirePermission(Permissions.RETURN_APPROVE);
        SalesReturn salesReturn = find(id);
        currentUserService.assertBranch(salesReturn.getBranch().getId());
        if (salesReturn.getStatus() != ReturnStatus.PENDING) {
            throw ApiException.badRequest("INVALID_RETURN_STATUS", "Only pending returns can be rejected.");
        }
        salesReturn.setStatus(ReturnStatus.REJECTED);
        salesReturn.setRejectionReason(request.reason().trim());
        returnRepository.save(salesReturn);
        auditService.log("SALES_RETURN_REJECTED", "SALES_RETURN", id,
                Map.of("status", "PENDING"), Map.of("status", "REJECTED"),
                request.reason(), salesReturn.getBranch().getId(), salesReturn.getDeviceId());
        return response(salesReturn);
    }

    @Transactional
    public ReturnDtos.ReturnResponse complete(Long id, ReturnDtos.CompleteReturnRequest request) {
        currentUserService.requirePermission(Permissions.POS_RETURN);
        SalesReturn salesReturn = find(id);
        currentUserService.assertBranch(salesReturn.getBranch().getId());
        if (salesReturn.getStatus() != ReturnStatus.APPROVED) {
            throw ApiException.badRequest("INVALID_RETURN_STATUS",
                    salesReturn.getStatus() == ReturnStatus.PENDING
                            ? "This return still needs approval before it can be completed."
                            : "Only approved returns can be completed.");
        }
        Business business = businessRepository.findById(currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        UserPrincipal principal = currentUserService.require();
        completeInternal(salesReturn, business, principal,
                request == null ? null : request.refundMethod(),
                request == null ? null : request.refundAmount(),
                request == null ? null : request.refundReference(), null);
        return response(salesReturn);
    }

    @Transactional
    public ReturnDtos.ReturnResponse cancel(Long id, ReturnDtos.CancelReturnRequest request) {
        currentUserService.requirePermission(Permissions.POS_RETURN);
        SalesReturn salesReturn = find(id);
        currentUserService.assertBranch(salesReturn.getBranch().getId());
        if (salesReturn.getStatus() != ReturnStatus.PENDING && salesReturn.getStatus() != ReturnStatus.APPROVED) {
            throw ApiException.badRequest("INVALID_RETURN_STATUS",
                    "Only pending or approved returns can be cancelled. Completed returns require a reversal.");
        }
        ReturnStatus previous = salesReturn.getStatus();
        salesReturn.setStatus(ReturnStatus.CANCELLED);
        salesReturn.setRejectionReason(request.reason().trim());
        returnRepository.save(salesReturn);
        auditService.log("SALES_RETURN_CANCELLED", "SALES_RETURN", id,
                Map.of("status", previous.name()), Map.of("status", "CANCELLED"),
                request.reason(), salesReturn.getBranch().getId(), salesReturn.getDeviceId());
        return response(salesReturn);
    }

    // ---------- Completion ----------

    private void completeInternal(SalesReturn salesReturn, Business business, UserPrincipal principal,
                                  String refundMethodRaw, BigDecimal refundAmountRaw, String refundReference,
                                  String approvalNote) {
        if (salesReturn.getStatus() == ReturnStatus.COMPLETED) {
            throw ApiException.badRequest("RETURN_ALREADY_COMPLETED", "This return has already been completed.");
        }
        Invoice invoice = salesReturn.getInvoice();
        PaymentMethod refundMethod = salesReturn.getRefundMethod();
        if (refundMethodRaw != null && !refundMethodRaw.isBlank()) {
            refundMethod = parseRefundMethod(refundMethodRaw);
        }
        BigDecimal refundAmount = refundAmountRaw != null ? Money.of(refundAmountRaw)
                : Money.nz(salesReturn.getRefundAmount());
        if (refundMethod == null && refundAmount.signum() > 0) {
            throw ApiException.badRequest("REFUND_METHOD_REQUIRED", "Choose a refund method for the refund amount.");
        }
        if (refundAmount.signum() > 0) {
            if (refundAmount.compareTo(salesReturn.getTotal()) > 0) {
                throw ApiException.badRequest("REFUND_EXCEEDS_RETURN",
                        "Refund cannot exceed the return value of " + Money.of(salesReturn.getTotal()) + ".");
            }
            BigDecimal alreadyRefunded = paymentRepository.sumRefundsForInvoice(invoice.getId());
            BigDecimal refundable = invoice.getPaidAmount().subtract(alreadyRefunded);
            if (refundAmount.compareTo(refundable) > 0) {
                throw ApiException.badRequest("REFUND_EXCEEDS_PAID",
                        "Refund cannot exceed the paid amount available for refund (" + Money.of(refundable) + ").");
            }
        }
        if (RefundPolicy.applies(business.isRefundToOriginalMethodOnly(), refundAmount, refundMethod)) {
            RefundPolicy.validate(paymentRepository.findOriginalReceiptMethods(invoice.getId()), refundMethod);
        }

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.isRestockItem()) {
                stockLedger.receive(salesReturn.getBranch(), item.getVariant(), item.getQuantity(), item.getCostPrice(),
                        business.getCostingMethod(), StockMovementType.SALE_RETURN, salesReturn.getReturnDate(),
                        "Sales return " + salesReturn.getReturnNo(), "SALES_RETURN", salesReturn.getReturnNo(),
                        principal.getId(), principal.getFullName(), salesReturn.getDeviceId());
            }
            item.getInvoiceItem().setReturnedQuantity(item.getInvoiceItem().getReturnedQuantity() + item.getQuantity());
            invoiceItemRepository.save(item.getInvoiceItem());
        }

        List<AccountingService.Line> lines = new ArrayList<>();
        lines.add(AccountingService.debit(AccountingService.SALES_RETURNS, salesReturn.getSubtotal(),
                "Sales return " + salesReturn.getReturnNo()));
        if (salesReturn.getTaxTotal().signum() > 0) {
            lines.add(AccountingService.debit(AccountingService.OUTPUT_GST, salesReturn.getTaxTotal(),
                    "Output GST reversed"));
        }
        lines.add(AccountingService.credit(AccountingService.RECEIVABLE, salesReturn.getTotal(),
                "Credit note " + salesReturn.getReturnNo()));
        if (salesReturn.getCostAmount().signum() > 0) {
            lines.add(AccountingService.debit(AccountingService.INVENTORY, salesReturn.getCostAmount(),
                    "Inventory restocked"));
            lines.add(AccountingService.credit(AccountingService.COGS, salesReturn.getCostAmount(),
                    "Cost of goods returned"));
        }
        JournalEntry journal = accountingService.post(salesReturn.getBusinessId(), salesReturn.getBranch(),
                salesReturn.getReturnDate(),
                "Sales return " + salesReturn.getReturnNo() + " against " + invoice.getInvoiceNo(),
                JournalSource.SALE_RETURN, salesReturn.getReturnNo(), lines,
                principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
        salesReturn.setJournalEntryId(journal.getId());

        if (refundAmount.signum() > 0 && refundMethod != null) {
            Payment refund = new Payment();
            refund.setBusinessId(salesReturn.getBusinessId());
            refund.setBranch(salesReturn.getBranch());
            refund.setPaymentNo(sequenceService.next(salesReturn.getBusinessId(), "REFUND", "RFD",
                    FinancialYear.of(salesReturn.getReturnDate(), business.getFinancialYearStartMonth()).label()));
            refund.setType(PaymentType.CUSTOMER_REFUND);
            refund.setCustomer(salesReturn.getCustomer());
            refund.setInvoice(invoice);
            refund.setPaymentDate(salesReturn.getReturnDate());
            refund.setMethod(refundMethod);
            refund.setAmount(refundAmount);
            refund.setReference(refundReference == null || refundReference.isBlank()
                    ? "Refund for " + salesReturn.getReturnNo() : refundReference.trim());
            refund.setNotes(salesReturn.getReason());
            refund.setStatus("POSTED");
            refund.setCreatedBy(principal.getId());
            refund.setCreatedByName(principal.getFullName());
            refund.setDeviceId(salesReturn.getDeviceId());
            refund.setSource(salesReturn.getSource());
            refund.setReturnId(salesReturn.getId());
            refund.setPostedAt(Instant.now());
            if (refundMethod == PaymentMethod.CASH) {
                cashSessionRepository.findFirstByBranchIdAndCashierIdAndStatusOrderByOpenedAtDesc(
                                salesReturn.getBranch().getId(), principal.getId(),
                                com.garmentshop.erp.domain.CashSessionStatus.OPEN)
                        .ifPresent(session -> refund.setCashSessionId(session.getId()));
            }
            paymentRepository.save(refund);
            String creditAccount = refundMethod == PaymentMethod.ADVANCE
                    ? AccountingService.CUSTOMER_ADVANCE : assetAccount(refundMethod);
            JournalEntry refundJournal = accountingService.post(salesReturn.getBusinessId(), salesReturn.getBranch(),
                    salesReturn.getReturnDate(),
                    "Refund " + refund.getPaymentNo() + " for " + salesReturn.getReturnNo(),
                    JournalSource.CUSTOMER_RECEIPT, refund.getPaymentNo(),
                    List.of(AccountingService.debit(AccountingService.RECEIVABLE, refundAmount,
                                    "Refund against " + invoice.getInvoiceNo()),
                            AccountingService.credit(creditAccount, refundAmount,
                                    refundMethod == PaymentMethod.ADVANCE
                                            ? "Store credit issued" : "Refund paid (" + refundMethod + ")")),
                    principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
            refund.setJournalEntryId(refundJournal.getId());
            paymentRepository.save(refund);
            salesReturn.setRefundPaymentId(refund.getId());
        }

        salesReturn.setRefundAmount(Money.of(refundAmount));
        salesReturn.setRefundMethod(refundMethod);
        if (refundReference != null && !refundReference.isBlank()) {
            salesReturn.setRefundReference(refundReference.trim());
        }
        salesReturn.setStatus(ReturnStatus.COMPLETED);
        salesReturn.setCompletedAt(Instant.now());
        if (approvalNote != null && salesReturn.getApprovedAt() == null) {
            salesReturn.setApprovedBy(principal.getId());
            salesReturn.setApprovedByName(principal.getFullName());
            salesReturn.setApprovedAt(Instant.now());
        }
        returnRepository.save(salesReturn);
        auditService.log("SALES_RETURN_COMPLETED", "SALES_RETURN", salesReturn.getId(),
                Map.of("status", "APPROVED"), Map.of("status", "COMPLETED", "refund", refundAmount),
                "Sales return completed", salesReturn.getBranch().getId(), salesReturn.getDeviceId());
    }

    // ---------- Helpers ----------

    private SalesReturn find(Long id) {
        return returnRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Sales return not found."));
    }

    private BigDecimal proportional(BigDecimal total, int quantity, int returnQuantity) {
        if (quantity <= 0) {
            return Money.ZERO;
        }
        return Money.of(total.multiply(BigDecimal.valueOf(returnQuantity))
                .divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP));
    }

    private ReturnType parseType(String raw) {
        try {
            return ReturnType.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_RETURN_TYPE", "Return type must be RETURN or EXCHANGE.");
        }
    }

    private ReturnStatus parseStatus(String raw) {
        try {
            return ReturnStatus.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_RETURN_STATUS", "Unknown return status.");
        }
    }

    private PaymentMethod parseRefundMethod(String raw) {
        try {
            PaymentMethod method = PaymentMethod.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
            if (method == PaymentMethod.CREDIT) {
                throw ApiException.badRequest("INVALID_REFUND_METHOD", "Credit is not a refund method.");
            }
            return method;
        } catch (ApiException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_REFUND_METHOD", "Unsupported refund method.");
        }
    }

    private String assetAccount(PaymentMethod method) {
        return switch (method) {
            case CASH -> AccountingService.CASH;
            case UPI -> AccountingService.UPI;
            case CARD -> AccountingService.CARD;
            case BANK, CHEQUE -> AccountingService.BANK;
            case ADVANCE -> AccountingService.CUSTOMER_ADVANCE;
            default -> throw ApiException.badRequest("INVALID_REFUND_METHOD", "Unsupported refund method.");
        };
    }

    private ReturnDtos.ReturnResponse response(SalesReturn salesReturn) {
        List<ReturnDtos.ReturnItemResponse> items = salesReturn.getItems().stream()
                .sorted(Comparator.comparing(SalesReturnItem::getId))
                .map(i -> new ReturnDtos.ReturnItemResponse(i.getId(), i.getInvoiceItem().getId(),
                        i.getVariant().getId(), i.getVariant().getProduct().getName(), i.getVariant().getSku(),
                        i.getQuantity(), i.getUnitPrice(), i.getTaxRate(), i.getTaxableAmount(), i.getTaxAmount(),
                        i.getLineTotal(), i.getCostPrice(), i.getCostAmount(), i.isRestockItem(),
                        i.getConditionNote()))
                .toList();
        return new ReturnDtos.ReturnResponse(salesReturn.getId(), salesReturn.getReturnNo(),
                salesReturn.getBranch().getId(), salesReturn.getBranch().getName(),
                salesReturn.getInvoice().getId(), salesReturn.getInvoice().getInvoiceNo(),
                salesReturn.getCustomer() == null ? null : salesReturn.getCustomer().getId(),
                salesReturn.getCustomer() == null ? null : salesReturn.getCustomer().getName(),
                salesReturn.getReturnDate(), salesReturn.getType().name(), salesReturn.getStatus().name(),
                salesReturn.getSubtotal(), salesReturn.getTaxTotal(), salesReturn.getTotal(),
                salesReturn.getRefundAmount(), salesReturn.getCostAmount(), salesReturn.getReason(),
                salesReturn.getConditionNotes(),
                salesReturn.getRefundMethod() == null ? null : salesReturn.getRefundMethod().name(),
                salesReturn.getRefundReference(), salesReturn.getExchangeInvoiceId(),
                salesReturn.getRequestedByName(), salesReturn.getApprovedByName(), salesReturn.getApprovedAt(),
                salesReturn.getRejectionReason(), salesReturn.getJournalEntryId(), salesReturn.getRefundPaymentId(),
                salesReturn.getCompletedAt(), salesReturn.isRestock(), salesReturn.getSource(),
                salesReturn.getDeviceId(), salesReturn.getOfflineId(), salesReturn.getCreatedAt(), items);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
