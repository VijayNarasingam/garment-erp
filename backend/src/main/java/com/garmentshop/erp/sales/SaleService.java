package com.garmentshop.erp.sales;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.garmentshop.erp.accounting.AccountingService;
import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.common.PageResponse;
import com.garmentshop.erp.common.SequenceService;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.CashSession;
import com.garmentshop.erp.domain.CashSessionStatus;
import com.garmentshop.erp.domain.Customer;
import com.garmentshop.erp.domain.HeldBill;
import com.garmentshop.erp.domain.IdempotencyRecord;
import com.garmentshop.erp.domain.Invoice;
import com.garmentshop.erp.domain.InvoiceCharge;
import com.garmentshop.erp.domain.InvoiceItem;
import com.garmentshop.erp.domain.InvoiceStatus;
import com.garmentshop.erp.domain.JournalEntry;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.NegativeStockApproval;
import com.garmentshop.erp.domain.Payment;
import com.garmentshop.erp.domain.PaymentAllocation;
import com.garmentshop.erp.domain.PaymentMethod;
import com.garmentshop.erp.domain.PaymentType;
import com.garmentshop.erp.domain.Product;
import com.garmentshop.erp.domain.ProductVariant;
import com.garmentshop.erp.domain.ReturnStatus;
import com.garmentshop.erp.domain.ReturnType;
import com.garmentshop.erp.domain.SalesReturn;
import com.garmentshop.erp.domain.TaxCategory;
import com.garmentshop.erp.domain.User;
import com.garmentshop.erp.inventory.StockLedger;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.CashSessionRepository;
import com.garmentshop.erp.repository.CustomerRepository;
import com.garmentshop.erp.repository.HeldBillRepository;
import com.garmentshop.erp.repository.IdempotencyRecordRepository;
import com.garmentshop.erp.repository.InvoiceItemRepository;
import com.garmentshop.erp.repository.InvoiceRepository;
import com.garmentshop.erp.repository.JournalEntryRepository;
import com.garmentshop.erp.repository.NegativeStockApprovalRepository;
import com.garmentshop.erp.repository.PaymentAllocationRepository;
import com.garmentshop.erp.repository.PaymentRepository;
import com.garmentshop.erp.repository.ProductVariantRepository;
import com.garmentshop.erp.repository.SalesReturnRepository;
import com.garmentshop.erp.security.ApprovalService;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import com.garmentshop.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class SaleService {

    private final InvoiceRepository invoiceRepository;
    private final InvoiceItemRepository invoiceItemRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentAllocationRepository paymentAllocationRepository;
    private final CustomerRepository customerRepository;
    private final ProductVariantRepository variantRepository;
    private final SalesReturnRepository salesReturnRepository;
    private final BusinessRepository businessRepository;
    private final CashSessionRepository cashSessionRepository;
    private final HeldBillRepository heldBillRepository;
    private final NegativeStockApprovalRepository negativeApprovalRepository;
    private final IdempotencyRecordRepository idempotencyRecordRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final StockLedger stockLedger;
    private final AccountingService accountingService;
    private final InvoiceNumberService invoiceNumberService;
    private final SequenceService sequenceService;
    private final CurrentUserService currentUserService;
    private final ApprovalService approvalService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;
    // ---------- Queries ----------

    @Transactional(readOnly = true)
    public PageResponse<SaleDtos.InvoiceResponse> invoices(Long branchId, String status, LocalDate from,
                                                           LocalDate to, String q, int page, int size) {
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        InvoiceStatus parsedStatus = null;
        if (status != null && !status.isBlank()) {
            try {
                parsedStatus = InvoiceStatus.valueOf(status.trim().toUpperCase(Locale.ENGLISH));
            } catch (IllegalArgumentException ex) {
                throw ApiException.badRequest("INVALID_STATUS", "Unknown invoice status: " + status);
            }
        }
        Page<Invoice> result = invoiceRepository.search(currentUserService.businessId(), branchId,
                parsedStatus, from, to, blankToNull(q),
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                        Sort.by(Sort.Direction.DESC, "invoiceDate").and(Sort.by(Sort.Direction.DESC, "id"))));
        return PageResponse.of(result, this::invoiceResponse);
    }

    @Transactional(readOnly = true)
    public SaleDtos.InvoiceResponse invoice(Long id) {
        Invoice invoice = invoiceRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Invoice not found."));
        currentUserService.assertBranch(invoice.getBranch().getId());
        return invoiceResponse(invoice);
    }

    @Transactional(readOnly = true)
    public SaleDtos.InvoiceResponse invoiceByOfflineId(String offlineId) {
        return invoiceRepository.findByOfflineId(offlineId)
                .filter(i -> Objects.equals(i.getBusinessId(), currentUserService.businessId()))
                .map(this::invoiceResponse).orElse(null);
    }

    // ---------- Sale creation ----------

    // Each invoice is committed independently. This lets an offline batch keep the invoices that
    // succeeded while reporting per-item conflicts for the rest.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public SaleDtos.InvoiceResponse create(CreateContext context, SaleDtos.CreateSaleRequest request) {
        currentUserService.requirePermission(Permissions.POS_BILL);
        Long businessId = currentUserService.businessId();
        String effectiveOfflineId = context.offlineId() != null ? context.offlineId() : blankToNull(request.offlineId());
        if (effectiveOfflineId != null) {
            Invoice existing = invoiceRepository.findByOfflineId(effectiveOfflineId).orElse(null);
            if (existing != null) {
                if (!Objects.equals(existing.getBusinessId(), businessId)) {
                    throw ApiException.conflict("OFFLINE_ID_CONFLICT", "This offline invoice ID belongs to another business.");
                }
                return invoiceResponse(existing);
            }
        }
        if (context.idempotencyKey() != null && !context.idempotencyKey().isBlank()) {
            IdempotencyRecord record = idempotencyRecordRepository.findByIdempotencyKey(context.idempotencyKey())
                    .orElse(null);
            if (record != null) {
                if (!record.getBusinessId().equals(businessId)) {
                    throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "This idempotency key belongs to another business.");
                }
                if (!record.getRequestHash().equals(hash(request))) {
                    throw ApiException.conflict("IDEMPOTENCY_PAYLOAD_MISMATCH",
                            "This idempotency key was already used with a different request.");
                }
                return storedInvoice(record);
            }
        }
        SaleDtos.InvoiceResponse response = createInternal(context, request, null, null);
        if (context.idempotencyKey() != null && !context.idempotencyKey().isBlank()) {
            IdempotencyRecord record = new IdempotencyRecord();
            record.setIdempotencyKey(context.idempotencyKey());
            record.setBusinessId(businessId);
            record.setEndpoint("POST /api/sales/invoices");
            record.setRequestHash(hash(request));
            record.setResponseStatus(200);
            record.setResponseBody("{\"invoiceId\":" + response.id() + "}");
            try {
                idempotencyRecordRepository.save(record);
            } catch (RuntimeException ignored) {
                // A concurrent duplicate already stored the same key; the unique index protects us.
            }
        }
        return response;
    }

    @Transactional
    public SaleDtos.InvoiceResponse amend(Long id, SaleDtos.AmendSaleRequest request) {
        currentUserService.requirePermission(Permissions.INVOICE_AMEND);
        Invoice original = invoiceRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Invoice not found."));
        currentUserService.assertBranch(original.getBranch().getId());
        if (original.getStatus() != InvoiceStatus.POSTED) {
            throw ApiException.badRequest("INVALID_INVOICE_STATUS", "Only posted invoices can be amended.");
        }
        if (!Objects.equals(request.sale().branchId(), original.getBranch().getId())) {
            throw ApiException.badRequest("BRANCH_MISMATCH", "An amendment must stay in the original branch.");
        }
        cancelInternal(original, "Amended: " + request.reason(), InvoiceStatus.AMENDED);
        SaleDtos.InvoiceResponse replacement = createInternal(CreateContext.online(null),
                request.sale(), original.getId(), request.reason());
        auditService.log("INVOICE_AMENDED", "INVOICE", original.getId(),
                Map.of("status", "POSTED"), Map.of("status", "AMENDED", "replacementId", replacement.id()),
                request.reason(), original.getBranch().getId(), null);
        return replacement;
    }

    @Transactional
    public SaleDtos.InvoiceResponse cancel(Long id, String reason) {
        currentUserService.requirePermission(Permissions.INVOICE_CANCEL);
        Invoice invoice = invoiceRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Invoice not found."));
        currentUserService.assertBranch(invoice.getBranch().getId());
        cancelInternal(invoice, reason, InvoiceStatus.CANCELLED);
        return invoiceResponse(invoice);
    }

    private SaleDtos.InvoiceResponse createInternal(CreateContext context, SaleDtos.CreateSaleRequest request,
                                                    Long originalInvoiceId, String amendmentReason) {
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(request.branchId());
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        UserPrincipal principal = currentUserService.require();
        LocalDate invoiceDate = request.invoiceDate() == null ? LocalDate.now() : request.invoiceDate();
        if (invoiceDate.isAfter(LocalDate.now())) {
            throw ApiException.badRequest("FUTURE_INVOICE_DATE", "Invoice dates cannot be in the future.");
        }
        Customer customer = null;
        if (request.customerId() != null) {
            customer = customerRepository.findByIdAndBusinessId(request.customerId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Customer not found."));
            if (!customer.isActive()) {
                throw ApiException.badRequest("CUSTOMER_INACTIVE", "This customer is inactive.");
            }
        }
        List<Line> lines = buildLines(request, business);
        BigDecimal subtotal = lines.stream().map(Line::gross).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal itemDiscount = lines.stream().map(Line::itemDiscount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal lineNetTotal = lines.stream().map(Line::lineTotalBefore).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal billDiscount = resolveBillDiscount(request, lineNetTotal);
        validateDiscounts(business, principal, subtotal, itemDiscount, billDiscount);
        applyBillDiscount(lines, billDiscount, lineNetTotal);

        BigDecimal taxableAmount = lines.stream().map(Line::taxable).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal taxTotal = lines.stream().map(Line::tax).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal additionalCharges = BigDecimal.ZERO;
        BigDecimal nonTaxableCharges = BigDecimal.ZERO;
        List<ChargeLine> charges = new ArrayList<>();
        if (request.charges() != null) {
            for (SaleDtos.SaleChargeRequest chargeRequest : request.charges()) {
                BigDecimal amount = Money.of(chargeRequest.amount());
                if (amount.signum() < 0) {
                    throw ApiException.badRequest("INVALID_CHARGE", "Charge amounts cannot be negative.");
                }
                BigDecimal rate = business.isGstEnabled() && chargeRequest.taxable()
                        ? Money.of(chargeRequest.taxRate() == null ? BigDecimal.ZERO : chargeRequest.taxRate())
                        : BigDecimal.ZERO;
                BigDecimal tax = chargeRequest.taxable()
                        ? Money.of(amount.multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP))
                        : BigDecimal.ZERO;
                additionalCharges = additionalCharges.add(amount);
                if (chargeRequest.taxable()) {
                    taxableAmount = taxableAmount.add(amount);
                    taxTotal = taxTotal.add(tax);
                } else {
                    nonTaxableCharges = nonTaxableCharges.add(amount);
                }
                charges.add(new ChargeLine(chargeRequest.name().trim(), amount, chargeRequest.taxable(), rate, tax));
            }
        }
        BigDecimal beforeRound = Money.of(taxableAmount.add(taxTotal).add(nonTaxableCharges));
        BigDecimal roundOff = business.isRoundOffEnabled() ? Money.roundOff(beforeRound) : Money.ZERO;
        BigDecimal total = beforeRound.add(roundOff);
        if (total.signum() <= 0) {
            throw ApiException.badRequest("ZERO_TOTAL", "Invoice total must be greater than zero.");
        }
        List<PaymentLine> paymentLines = resolvePayments(request, total, customer, business);
        SalesReturn exchangeReturn = originalInvoiceId == null
                ? resolveExchangeReturn(request, paymentLines, branch, customer)
                : null;
        BigDecimal paid = paymentLines.stream().map(PaymentLine::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal balance = total.subtract(paid);
        if (balance.signum() < 0) {
            throw ApiException.badRequest("OVERPAYMENT", "Tendered amount cannot exceed the invoice total.");
        }
        if (balance.signum() > 0) {
            validateCredit(customer, balance, businessId);
        }
        NegativeApproval negativeApproval = resolveNegativeStock(business, branch, lines, request, principal);

        InvoiceNumberService.InvoiceNumber number = invoiceNumberService.allocate(branch, invoiceDate,
                business.getFinancialYearStartMonth());
        Invoice invoice = new Invoice();
        invoice.setBusinessId(businessId);
        invoice.setBranch(branch);
        invoice.setInvoiceNo(number.invoiceNo());
        invoice.setFinancialYear(number.financialYear());
        invoice.setInvoiceDate(invoiceDate);
        invoice.setStatus(InvoiceStatus.POSTED);
        invoice.setCustomer(customer);
        invoice.setCustomerName(customer == null ? "Walk-in customer" : customer.getName());
        invoice.setCustomerPhone(customer == null ? null : customer.getPhone());
        invoice.setCustomerGstin(customer == null ? null : customer.getGstin());
        invoice.setPlaceOfSupplyStateCode(firstNonBlank(request.placeOfSupplyStateCode(),
                customer == null ? null : customer.getStateCode(), branch.getStateCode(), business.getStateCode()));
        invoice.setSubtotal(Money.of(subtotal));
        invoice.setItemDiscount(Money.of(itemDiscount));
        invoice.setBillDiscount(Money.of(billDiscount));
        invoice.setAdditionalCharges(Money.of(additionalCharges));
        invoice.setTaxableAmount(Money.of(taxableAmount));
        invoice.setTaxTotal(Money.of(taxTotal));
        invoice.setRoundOff(Money.of(roundOff));
        invoice.setTotal(Money.of(total));
        invoice.setPaidAmount(Money.of(paid));
        invoice.setBalanceAmount(Money.of(balance));
        invoice.setGstEnabled(business.isGstEnabled());
        invoice.setTaxInclusive(lines.stream().anyMatch(Line::taxInclusive));
        invoice.setNotes(request.notes());
        invoice.setOriginalInvoiceId(originalInvoiceId);
        invoice.setAmendmentReason(amendmentReason);
        invoice.setCreatedBy(principal.getId());
        invoice.setCreatedByName(principal.getFullName());
        invoice.setDeviceId(blankToNull(request.deviceId()));
        invoice.setOfflineId(context.offlineId() != null ? context.offlineId()
                : (originalInvoiceId == null ? blankToNull(request.offlineId()) : null));
        invoice.setClientInvoiceRef(blankToNull(request.clientInvoiceRef()));
        invoice.setSource(context.source());
        invoice.setPostedAt(Instant.now());
        for (Line line : lines) {
            InvoiceItem item = new InvoiceItem();
            item.setInvoice(invoice);
            item.setVariant(line.variant());
            item.setProductName(line.variant().getProduct().getName());
            item.setSku(line.variant().getSku());
            item.setSize(line.variant().getSize());
            item.setColor(line.variant().getColor());
            item.setHsnCode(line.hsnCode());
            item.setQuantity(line.quantity());
            item.setUnitPrice(line.unitPrice());
            item.setMrp(line.variant().getMrp());
            item.setDiscountPercent(line.discountPercent());
            item.setDiscountAmount(Money.of(line.itemDiscount().add(line.allocatedBillDiscount())));
            item.setTaxRate(line.taxRate());
            item.setTaxInclusive(line.taxInclusive());
            item.setTaxableAmount(line.taxable());
            item.setTaxAmount(line.tax());
            item.setLineTotal(line.lineTotal());
            invoice.getItems().add(item);
        }
        for (ChargeLine charge : charges) {
            InvoiceCharge entity = new InvoiceCharge();
            entity.setInvoice(invoice);
            entity.setName(charge.name());
            entity.setAmount(charge.amount());
            entity.setTaxable(charge.taxable());
            entity.setTaxRate(charge.taxRate());
            entity.setTaxAmount(charge.tax());
            invoice.getCharges().add(entity);
        }
        invoiceRepository.save(invoice);

        BigDecimal costOfGoods = BigDecimal.ZERO;
        for (InvoiceItem item : invoice.getItems()) {
            StockLedger.StockResult issued = stockLedger.issue(branch, item.getVariant(), item.getQuantity(),
                    business.getCostingMethod(), com.garmentshop.erp.domain.StockMovementType.SALE, invoiceDate,
                    "Sale " + invoice.getInvoiceNo(), "INVOICE", invoice.getInvoiceNo(), principal.getId(),
                    principal.getFullName(), invoice.getDeviceId(), negativeApproval != null);
            item.setCostPrice(issued.unitCost());
            item.setCostAmount(issued.totalCost());
            costOfGoods = costOfGoods.add(issued.totalCost());
        }
        invoice.setCostOfGoods(Money.of(costOfGoods));
        invoice.setGrossProfit(Money.of(taxableAmount.subtract(costOfGoods)));
        if (negativeApproval != null) {
            for (Map.Entry<Long, Integer> entry : negativeApproval.shortages().entrySet()) {
                NegativeStockApproval approval = new NegativeStockApproval();
                approval.setBusinessId(businessId);
                approval.setBranch(branch);
                approval.setVariant(lines.stream().filter(l -> l.variant().getId().equals(entry.getKey()))
                        .findFirst().orElseThrow().variant());
                approval.setInvoiceId(invoice.getId());
                approval.setRequestedBy(principal.getId());
                approval.setApprovedBy(negativeApproval.approver().getId());
                approval.setApproverUsername(negativeApproval.approver().getUsername());
                approval.setReason(negativeApproval.reason());
                approval.setQuantity(entry.getValue());
                approval.setDeviceId(invoice.getDeviceId() == null ? "server" : invoice.getDeviceId());
                negativeApprovalRepository.save(approval);
            }
        }

        List<Payment> payments = new ArrayList<>();
        for (PaymentLine paymentLine : paymentLines) {
            Payment payment = new Payment();
            payment.setBusinessId(businessId);
            payment.setBranch(branch);
            payment.setPaymentNo(sequenceService.next(businessId, "PAYMENT", "PAY",
                    FinancialYear.of(invoiceDate, business.getFinancialYearStartMonth()).label()));
            payment.setType(PaymentType.CUSTOMER_RECEIPT);
            payment.setCustomer(customer);
            payment.setInvoice(invoice);
            payment.setPaymentDate(invoiceDate);
            payment.setMethod(paymentLine.method());
            payment.setAmount(paymentLine.amount());
            payment.setReference(paymentLine.reference());
            payment.setNotes("Against " + invoice.getInvoiceNo());
            payment.setStatus("POSTED");
            payment.setCreatedBy(principal.getId());
            payment.setCreatedByName(principal.getFullName());
            payment.setDeviceId(invoice.getDeviceId());
            payment.setOfflineId(invoice.getOfflineId() == null ? null : invoice.getOfflineId() + "-PAY-" + (payments.size() + 1));
            payment.setSource(invoice.getSource());
            payment.setPostedAt(Instant.now());
            if (paymentLine.method() == PaymentMethod.CASH) {
                cashSessionRepository.findFirstByBranchIdAndCashierIdAndStatusOrderByOpenedAtDesc(
                        branch.getId(), principal.getId(), CashSessionStatus.OPEN)
                        .ifPresent(session -> payment.setCashSessionId(session.getId()));
            }
            paymentRepository.save(payment);
            PaymentAllocation allocation = new PaymentAllocation();
            allocation.setPayment(payment);
            allocation.setInvoice(invoice);
            allocation.setAmount(payment.getAmount());
            paymentAllocationRepository.save(allocation);
            JournalEntry journal = postReceipt(business, branch, payment, invoiceDate, principal);
            if (journal != null) {
                payment.setJournalEntryId(journal.getId());
                paymentRepository.save(payment);
            }
            payments.add(payment);
        }

        JournalEntry saleJournal = postSaleJournal(business, branch, invoice, taxableAmount, taxTotal, roundOff,
                total, principal);
        invoice.setJournalEntryId(saleJournal.getId());
        if (costOfGoods.signum() > 0) {
            JournalEntry costJournal = accountingService.post(businessId, branch, invoiceDate,
                    "Cost of goods sold for " + invoice.getInvoiceNo(),
                    JournalSource.SALE, invoice.getInvoiceNo() + "-COGS",
                    List.of(AccountingService.debit(AccountingService.COGS, costOfGoods, "Cost of goods sold"),
                            AccountingService.credit(AccountingService.INVENTORY, costOfGoods, "Inventory issued")),
                    principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
            invoice.setCostJournalEntryId(costJournal.getId());
        }
        invoiceRepository.save(invoice);
        if (exchangeReturn != null) {
            exchangeReturn.setExchangeInvoiceId(invoice.getId());
            salesReturnRepository.save(exchangeReturn);
        }
        auditService.log("INVOICE_POSTED", "INVOICE", invoice.getId(), null,
                Map.of("invoiceNo", invoice.getInvoiceNo(), "total", invoice.getTotal(),
                        "paid", invoice.getPaidAmount(), "balance", invoice.getBalanceAmount()),
                "Invoice posted", branch.getId(), invoice.getDeviceId());
        return invoiceResponse(invoice);
    }

    private List<Line> buildLines(SaleDtos.CreateSaleRequest request, Business business) {
        Long businessId = currentUserService.businessId();
        List<Line> lines = new ArrayList<>();
        Map<Long, ProductVariant> seen = new LinkedHashMap<>();
        for (SaleDtos.SaleItemRequest itemRequest : request.items()) {
            ProductVariant variant = variantRepository.findByIdAndBusinessId(itemRequest.variantId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Variant not found."));
            Product product = variant.getProduct();
            if (!variant.isActive() || !product.isActive()) {
                throw ApiException.badRequest("PRODUCT_INACTIVE", "Product " + product.getName() + " is inactive.");
            }
            if (seen.putIfAbsent(variant.getId(), variant) != null) {
                throw ApiException.badRequest("DUPLICATE_ITEM",
                        "Variant " + variant.getSku() + " appears more than once. Merge the quantity instead.");
            }
            TaxCategory tax = product.getTaxCategory();
            BigDecimal taxRate = business.isGstEnabled() && tax != null ? Money.of(tax.getGstRate()) : Money.ZERO;
            boolean inclusive = tax == null ? business.isDefaultTaxInclusive()
                    : Boolean.TRUE.equals(tax.getTaxInclusive());
            if (!business.isGstEnabled()) {
                inclusive = false;
            }
            BigDecimal unitPrice = Money.of(itemRequest.unitPrice() == null
                    ? variant.getSellingPrice() : itemRequest.unitPrice());
            if (unitPrice.signum() < 0) {
                throw ApiException.badRequest("INVALID_PRICE", "Unit price cannot be negative.");
            }
            BigDecimal gross = Money.of(unitPrice.multiply(BigDecimal.valueOf(itemRequest.quantity())));
            BigDecimal discountPercent = Money.of(itemRequest.discountPercent());
            BigDecimal discountAmount = itemRequest.discountAmount() == null ? null : Money.of(itemRequest.discountAmount());
            if (discountPercent.signum() > 0 && discountAmount != null && discountAmount.signum() > 0) {
                throw ApiException.badRequest("AMBIGUOUS_DISCOUNT",
                        "Provide either a discount percent or amount for each item, not both.");
            }
            BigDecimal itemDiscount = discountAmount != null ? discountAmount
                    : Money.percentOf(gross, discountPercent);
            if (itemDiscount.compareTo(gross) > 0) {
                throw ApiException.badRequest("DISCOUNT_TOO_HIGH", "Item discount cannot exceed the line value.");
            }
            BigDecimal net = gross.subtract(itemDiscount);
            BigDecimal taxable;
            BigDecimal taxAmount;
            if (inclusive && taxRate.signum() > 0) {
                BigDecimal divisor = BigDecimal.ONE.add(taxRate.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                taxable = Money.of(net.divide(divisor, 2, RoundingMode.HALF_UP));
                taxAmount = net.subtract(taxable);
            } else {
                taxable = net;
                taxAmount = Money.of(taxable.multiply(taxRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
            }
            lines.add(new Line(variant, itemRequest.quantity(), unitPrice, discountPercent, itemDiscount, gross,
                    taxRate, inclusive, taxable, taxAmount, net, Money.ZERO, taxable, taxAmount, net,
                    product.getHsnCode()));
        }
        if (lines.isEmpty()) {
            throw ApiException.badRequest("EMPTY_SALE", "Add at least one item to the invoice.");
        }
        return lines;
    }

    private BigDecimal resolveBillDiscount(SaleDtos.CreateSaleRequest request, BigDecimal base) {
        BigDecimal percent = Money.of(request.billDiscountPercent());
        BigDecimal amount = request.billDiscountAmount() == null ? null : Money.of(request.billDiscountAmount());
        if (percent.signum() > 0 && amount != null && amount.signum() > 0) {
            throw ApiException.badRequest("AMBIGUOUS_DISCOUNT",
                    "Provide either a bill discount percent or amount, not both.");
        }
        BigDecimal discount = amount != null ? amount : Money.percentOf(base, percent);
        if (discount.compareTo(base) > 0) {
            throw ApiException.badRequest("DISCOUNT_TOO_HIGH", "Bill discount cannot exceed the invoice value.");
        }
        return discount;
    }

    private void validateDiscounts(Business business, UserPrincipal principal, BigDecimal subtotal,
                                   BigDecimal itemDiscount, BigDecimal billDiscount) {
        BigDecimal totalDiscount = itemDiscount.add(billDiscount);
        if (totalDiscount.signum() <= 0) {
            return;
        }
        if (!principal.hasPermission(Permissions.POS_DISCOUNT)) {
            throw ApiException.forbidden("DISCOUNT_NOT_ALLOWED", "Your role cannot apply manual discounts.");
        }
        BigDecimal effectivePercent = subtotal.signum() == 0 ? BigDecimal.ZERO
                : totalDiscount.multiply(BigDecimal.valueOf(100)).divide(subtotal, 2, RoundingMode.HALF_UP);
        BigDecimal limit = principal.hasPermission(Permissions.DISCOUNT_APPROVE)
                ? business.getMaxDiscountPercent()
                : principal.getDiscountLimitPercent().min(business.getMaxDiscountPercent());
        if (effectivePercent.compareTo(limit) > 0) {
            throw ApiException.forbidden("DISCOUNT_LIMIT_EXCEEDED",
                    "Discount of " + effectivePercent + "% exceeds your limit of " + limit + "%.");
        }
    }

    private void applyBillDiscount(List<Line> lines, BigDecimal billDiscount, BigDecimal lineNetTotal) {
        if (billDiscount.signum() == 0) {
            for (Line line : lines) {
                line.taxable = line.taxableBefore;
                line.tax = line.taxBefore;
                line.lineTotal = line.lineTotalBefore;
                line.allocatedBillDiscount = Money.ZERO;
            }
            return;
        }
        BigDecimal ratio = billDiscount.divide(lineNetTotal, 8, RoundingMode.HALF_UP);
        BigDecimal allocatedTotal = BigDecimal.ZERO;
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            BigDecimal allocated = i == lines.size() - 1
                    ? billDiscount.subtract(allocatedTotal)
                    : Money.of(line.lineTotalBefore.multiply(ratio));
            allocatedTotal = allocatedTotal.add(allocated);
            BigDecimal factor = BigDecimal.ONE.subtract(ratio);
            line.taxable = Money.of(line.taxableBefore.multiply(factor));
            line.tax = Money.of(line.taxBefore.multiply(factor));
            line.lineTotal = line.lineTotalBefore.subtract(allocated);
            line.allocatedBillDiscount = allocated;
        }
    }

    private List<PaymentLine> resolvePayments(SaleDtos.CreateSaleRequest request, BigDecimal total,
                                              Customer customer, Business business) {
        List<PaymentLine> result = new ArrayList<>();
        if (request.payments() == null) {
            return result;
        }
        BigDecimal advanceRequested = BigDecimal.ZERO;
        for (SaleDtos.SalePaymentRequest payment : request.payments()) {
            PaymentMethod method = parsePaymentMethod(payment.method());
            if (method == PaymentMethod.CREDIT) {
                throw ApiException.badRequest("INVALID_PAYMENT_METHOD",
                        "Credit is not a tender. Leave payments empty for a credit sale.");
            }
            if (method == PaymentMethod.ADVANCE) {
                if (customer == null) {
                    throw ApiException.badRequest("ADVANCE_CUSTOMER_REQUIRED",
                            "Select a customer before applying an advance.");
                }
                advanceRequested = advanceRequested.add(payment.amount());
            }
            result.add(new PaymentLine(method, Money.of(payment.amount()), payment.reference()));
        }
        if (advanceRequested.signum() > 0) {
            BigDecimal available = customerAdvanceBalance(currentUserService.businessId(), customer.getId());
            if (advanceRequested.compareTo(available) > 0) {
                throw ApiException.badRequest("INSUFFICIENT_ADVANCE",
                        "Customer advance available is " + Money.of(available) + ".");
            }
        }
        BigDecimal paid = result.stream().map(PaymentLine::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (paid.compareTo(total) > 0) {
            boolean hasExchangeCredit = result.stream().anyMatch(payment -> payment.method() == PaymentMethod.EXCHANGE);
            if (hasExchangeCredit) {
                throw ApiException.badRequest("EXCHANGE_CREDIT_EXCEEDS_BILL",
                        "The exchange credit is higher than this bill. Add items worth at least the credit; "
                                + "refunding the difference is not supported yet.");
            }
            throw ApiException.badRequest("OVERPAYMENT", "Tendered amount cannot exceed the invoice total.");
        }
        return result;
    }

    /**
     * Validates that an EXCHANGE tender is backed by a completed exchange return that has not
     * already been consumed by another invoice. This prevents fabricated store credit at the API.
     */
    private SalesReturn resolveExchangeReturn(SaleDtos.CreateSaleRequest request, List<PaymentLine> paymentLines,
                                              Branch branch, Customer customer) {
        BigDecimal exchangePaid = paymentLines.stream()
                .filter(payment -> payment.method() == PaymentMethod.EXCHANGE)
                .map(PaymentLine::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        Long returnId = request.exchangeReturnId();
        if (returnId == null) {
            if (exchangePaid.signum() > 0) {
                throw ApiException.badRequest("EXCHANGE_RETURN_REQUIRED",
                        "An EXCHANGE payment must reference a completed exchange return.");
            }
            return null;
        }
        SalesReturn salesReturn = salesReturnRepository
                .findByIdAndBusinessId(returnId, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Exchange return not found."));
        if (!salesReturn.getBranch().getId().equals(branch.getId())) {
            throw ApiException.badRequest("EXCHANGE_BRANCH_MISMATCH",
                    "The exchange return belongs to another branch.");
        }
        if (salesReturn.getType() != ReturnType.EXCHANGE) {
            throw ApiException.badRequest("NOT_AN_EXCHANGE", "The referenced return is not an exchange.");
        }
        if (salesReturn.getStatus() != ReturnStatus.COMPLETED) {
            throw ApiException.badRequest("EXCHANGE_NOT_COMPLETED",
                    "The exchange return must be completed before the new bill is posted.");
        }
        if (salesReturn.getExchangeInvoiceId() != null) {
            throw ApiException.conflict("EXCHANGE_ALREADY_USED",
                    "This exchange return is already linked to an invoice.");
        }
        if (exchangePaid.signum() <= 0) {
            throw ApiException.badRequest("EXCHANGE_PAYMENT_REQUIRED",
                    "Add an EXCHANGE payment for the return credit.");
        }
        if (exchangePaid.compareTo(salesReturn.getTotal()) != 0) {
            throw ApiException.badRequest("EXCHANGE_CREDIT_MISMATCH",
                    "The EXCHANGE payment must equal the return credit of "
                            + Money.of(salesReturn.getTotal()) + ".");
        }
        Long returnCustomerId = salesReturn.getCustomer() == null ? null : salesReturn.getCustomer().getId();
        Long invoiceCustomerId = customer == null ? null : customer.getId();
        if (!Objects.equals(returnCustomerId, invoiceCustomerId)) {
            throw ApiException.badRequest("EXCHANGE_CUSTOMER_MISMATCH",
                    "The exchange bill must use the same customer as the original invoice.");
        }
        return salesReturn;
    }

    private PaymentMethod parsePaymentMethod(String raw) {
        try {
            return PaymentMethod.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_PAYMENT_METHOD", "Unsupported payment method: " + raw);
        }
    }

    private void validateCredit(Customer customer, BigDecimal balance, Long businessId) {
        if (customer == null) {
            throw ApiException.badRequest("CUSTOMER_REQUIRED_FOR_CREDIT",
                    "A customer is required when the invoice is not fully paid.");
        }
        if (customer.getCreditLimit() == null || customer.getCreditLimit().signum() <= 0) {
            throw ApiException.forbidden("CREDIT_NOT_ALLOWED", "This customer has no approved credit limit.");
        }
        BigDecimal outstanding = invoiceRepository.findByCustomer(customer.getId(), null).stream()
                .filter(i -> i.getStatus() == InvoiceStatus.POSTED)
                .map(Invoice::getBalanceAmount).reduce(customer.getOpeningBalance(), BigDecimal::add);
        if (outstanding.add(balance).compareTo(customer.getCreditLimit()) > 0) {
            throw ApiException.forbidden("CREDIT_LIMIT_EXCEEDED",
                    "Credit limit exceeded. Outstanding " + Money.of(outstanding) + ", new balance "
                            + Money.of(balance) + ", limit " + customer.getCreditLimit() + ".");
        }
    }

    private NegativeApproval resolveNegativeStock(Business business, Branch branch, List<Line> lines,
                                                  SaleDtos.CreateSaleRequest request, UserPrincipal principal) {
        Map<Long, Integer> shortages = new LinkedHashMap<>();
        for (Line line : lines) {
            int available = stockLedger.quantity(branch.getId(), line.variant().getId());
            if (line.quantity() > available) {
                shortages.put(line.variant().getId(), line.quantity() - available);
            }
        }
        if (shortages.isEmpty()) {
            return null;
        }
        if (!business.isAllowNegativeStockWithApproval()) {
            throw ApiException.badRequest("INSUFFICIENT_STOCK",
                    "Insufficient stock and negative stock is disabled for this business.");
        }
        User approver = approvalService.authorize(request.approverUsername(), request.approverPin(),
                Permissions.NEGATIVE_STOCK_APPROVE, branch.getId(),
                "Negative stock sale approval for " + branch.getName());
        return new NegativeApproval(approver, shortages, "Negative stock sale at POS");
    }

    private BigDecimal customerAdvanceBalance(Long businessId, Long customerId) {
        return paymentRepository.advanceReceipts(businessId, customerId)
                .subtract(paymentRepository.advancesApplied(businessId, customerId))
                .add(paymentRepository.advancesRestored(businessId, customerId));
    }

    private JournalEntry postReceipt(Business business, Branch branch, Payment payment, LocalDate date,
                                     UserPrincipal principal) {
        if (payment.getMethod() == PaymentMethod.EXCHANGE) {
            // An exchange credit moves goods, not money — the offsetting leg lives on the return
            // (Dr Sales returns / Cr Receivable). Skip the receipt journal entirely.
            return null;
        }
        String assetAccount = switch (payment.getMethod()) {
            case CASH -> AccountingService.CASH;
            case UPI -> AccountingService.UPI;
            case CARD -> AccountingService.CARD;
            case BANK, CHEQUE -> AccountingService.BANK;
            case ADVANCE -> AccountingService.CUSTOMER_ADVANCE;
            case EXCHANGE -> AccountingService.RECEIVABLE; // never reached — handled above
            default -> throw ApiException.badRequest("INVALID_PAYMENT_METHOD",
                    "No ledger mapping for payment method " + payment.getMethod());
        };
        List<AccountingService.Line> lines = List.of(
                AccountingService.debit(assetAccount, payment.getAmount(),
                        "Receipt " + payment.getPaymentNo() + " (" + payment.getMethod() + ")"),
                AccountingService.credit(AccountingService.RECEIVABLE, payment.getAmount(),
                        "Receipt against invoice " + payment.getInvoice().getInvoiceNo()));
        return accountingService.post(business.getId(), branch, date,
                "Receipt " + payment.getPaymentNo() + " for " + payment.getInvoice().getInvoiceNo(),
                JournalSource.CUSTOMER_RECEIPT, payment.getPaymentNo(), lines,
                principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
    }

    private JournalEntry postSaleJournal(Business business, Branch branch, Invoice invoice, BigDecimal taxable,
                                         BigDecimal tax, BigDecimal roundOff, BigDecimal total,
                                         UserPrincipal principal) {
        List<AccountingService.Line> lines = new ArrayList<>();
        lines.add(AccountingService.debit(AccountingService.RECEIVABLE, total,
                "Invoice " + invoice.getInvoiceNo()));
        lines.add(AccountingService.credit(AccountingService.SALES, taxable, "Net sales"));
        if (tax.signum() > 0) {
            lines.add(AccountingService.credit(AccountingService.OUTPUT_GST, tax, "Output GST"));
        }
        if (roundOff.signum() > 0) {
            lines.add(AccountingService.credit(AccountingService.ROUND_OFF, roundOff, "Invoice round off"));
        } else if (roundOff.signum() < 0) {
            lines.add(AccountingService.debit(AccountingService.ROUND_OFF, roundOff.abs(), "Invoice round off"));
        }
        return accountingService.post(business.getId(), branch, invoice.getInvoiceDate(),
                "Sale " + invoice.getInvoiceNo(), JournalSource.SALE, invoice.getInvoiceNo(), lines,
                principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
    }

    // ---------- Cancellation / amendment internals ----------

    private void cancelInternal(Invoice invoice, String reason, InvoiceStatus targetStatus) {
        if (invoice.getStatus() != InvoiceStatus.POSTED) {
            throw ApiException.badRequest("INVALID_INVOICE_STATUS", "Only posted invoices can be cancelled or amended.");
        }
        if (reason == null || reason.isBlank()) {
            throw ApiException.badRequest("REASON_REQUIRED", "A reason is required.");
        }
        Long businessId = currentUserService.businessId();
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        UserPrincipal principal = currentUserService.require();
        Branch branch = invoice.getBranch();
        if (invoice.getJournalEntryId() != null) {
            JournalEntry original = journalEntryRepository.findById(invoice.getJournalEntryId())
                    .orElseThrow(() -> ApiException.notFound("Original sale journal not found."));
            accountingService.reverse(businessId, original, reason, principal.getId(), principal.getFullName(),
                    business.getFinancialYearStartMonth());
        }
        if (invoice.getCostJournalEntryId() != null) {
            JournalEntry original = journalEntryRepository.findById(invoice.getCostJournalEntryId())
                    .orElseThrow(() -> ApiException.notFound("Original cost journal not found."));
            accountingService.reverse(businessId, original, reason, principal.getId(), principal.getFullName(),
                    business.getFinancialYearStartMonth());
        }
        for (InvoiceItem item : invoice.getItems()) {
            stockLedger.receive(branch, item.getVariant(), item.getQuantity(), item.getCostPrice(),
                    business.getCostingMethod(), com.garmentshop.erp.domain.StockMovementType.SALE_RETURN,
                    LocalDate.now(), "Invoice " + targetStatus.name().toLowerCase(Locale.ENGLISH) + ": " + reason,
                    "INVOICE_REVERSAL", invoice.getInvoiceNo(), principal.getId(), principal.getFullName(),
                    invoice.getDeviceId());
        }
        List<Payment> originalPayments = paymentRepository.findByInvoiceIdAndStatusOrderByIdAsc(invoice.getId(), "POSTED");
        for (Payment original : originalPayments) {
            if (original.getType() != PaymentType.CUSTOMER_RECEIPT) {
                continue;
            }
            Payment refund = new Payment();
            refund.setBusinessId(businessId);
            refund.setBranch(branch);
            refund.setPaymentNo(sequenceService.next(businessId, "REFUND", "RFD",
                    FinancialYear.current(business.getFinancialYearStartMonth()).label()));
            refund.setType(PaymentType.CUSTOMER_REFUND);
            refund.setCustomer(original.getCustomer());
            refund.setInvoice(invoice);
            refund.setPaymentDate(LocalDate.now());
            refund.setMethod(original.getMethod());
            refund.setAmount(original.getAmount());
            refund.setReference("Refund for " + invoice.getInvoiceNo());
            refund.setNotes(reason);
            refund.setStatus("POSTED");
            refund.setCreatedBy(principal.getId());
            refund.setCreatedByName(principal.getFullName());
            refund.setDeviceId(invoice.getDeviceId());
            refund.setSource(invoice.getSource());
            refund.setPostedAt(Instant.now());
            if (original.getMethod() == PaymentMethod.CASH) {
                cashSessionRepository.findFirstByBranchIdAndCashierIdAndStatusOrderByOpenedAtDesc(
                                branch.getId(), principal.getId(), CashSessionStatus.OPEN)
                        .ifPresent(session -> refund.setCashSessionId(session.getId()));
            }
            paymentRepository.save(refund);
            String creditAccount = original.getMethod() == PaymentMethod.ADVANCE
                    ? AccountingService.CUSTOMER_ADVANCE : assetAccount(original.getMethod());
            JournalEntry journal = accountingService.post(businessId, branch, LocalDate.now(),
                    "Refund " + refund.getPaymentNo() + " for " + invoice.getInvoiceNo(),
                    JournalSource.CUSTOMER_RECEIPT, refund.getPaymentNo(),
                    List.of(AccountingService.debit(AccountingService.RECEIVABLE, refund.getAmount(),
                                    "Customer refund"),
                            AccountingService.credit(creditAccount, refund.getAmount(), "Refund of receipt")),
                    principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
            refund.setJournalEntryId(journal.getId());
            paymentRepository.save(refund);
        }
        invoice.setStatus(targetStatus);
        invoice.setCancelledAt(Instant.now());
        invoice.setCancelledBy(principal.getId());
        invoice.setCancelReason(reason);
        invoice.setBalanceAmount(Money.ZERO);
        invoiceRepository.save(invoice);
        auditService.log(targetStatus == InvoiceStatus.AMENDED ? "INVOICE_AMENDED" : "INVOICE_CANCELLED",
                "INVOICE", invoice.getId(), Map.of("status", "POSTED"),
                Map.of("status", targetStatus.name()), reason, branch.getId(), invoice.getDeviceId());
    }

    private String assetAccount(PaymentMethod method) {
        return switch (method) {
            case CASH -> AccountingService.CASH;
            case UPI -> AccountingService.UPI;
            case CARD -> AccountingService.CARD;
            case BANK, CHEQUE -> AccountingService.BANK;
            case ADVANCE -> AccountingService.CUSTOMER_ADVANCE;
            // Exchange credits net out against receivables through the return journal — no cash/card account to debit.
            case EXCHANGE -> AccountingService.RECEIVABLE;
            default -> throw ApiException.badRequest("INVALID_PAYMENT_METHOD",
                    "No ledger mapping for payment method " + method);
        };
    }

    // ---------- Held bills ----------

    @Transactional
    public SaleDtos.HeldBillResponse holdBill(SaleDtos.HeldBillRequest request) {
        currentUserService.requirePermission(Permissions.POS_HOLD);
        Branch branch = currentUserService.branch(request.branchId());
        if (request.dataJson().length() > 500_000) {
            throw ApiException.badRequest("HELD_BILL_TOO_LARGE", "Held bill data exceeds the allowed size.");
        }
        HeldBill held = new HeldBill();
        held.setBusinessId(currentUserService.businessId());
        held.setBranch(branch);
        held.setLabel(request.label().trim());
        held.setCustomerId(request.customerId());
        held.setDataJson(request.dataJson());
        held.setCreatedBy(currentUserService.userId());
        heldBillRepository.save(held);
        auditService.log("BILL_HELD", "HELD_BILL", held.getId(), null,
                Map.of("label", held.getLabel()), "Bill held", branch.getId(), null);
        return heldBillResponse(held);
    }

    @Transactional(readOnly = true)
    public List<SaleDtos.HeldBillResponse> heldBills(Long branchId) {
        currentUserService.requirePermission(Permissions.POS_HOLD);
        currentUserService.assertBranch(branchId);
        return heldBillRepository.findByBranchIdOrderByIdDesc(branchId).stream()
                .map(this::heldBillResponse).toList();
    }

    @Transactional
    public void deleteHeldBill(Long id) {
        currentUserService.requirePermission(Permissions.POS_HOLD);
        HeldBill held = heldBillRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Held bill not found."));
        if (!Objects.equals(held.getBusinessId(), currentUserService.businessId())) {
            throw ApiException.notFound("Held bill not found.");
        }
        currentUserService.assertBranch(held.getBranch().getId());
        heldBillRepository.delete(held);
        auditService.log("HELD_BILL_DELETED", "HELD_BILL", id, Map.of("label", held.getLabel()), null,
                "Held bill removed", held.getBranch().getId(), null);
    }

    // ---------- Mapping ----------

    private SaleDtos.InvoiceResponse invoiceResponse(Invoice invoice) {
        List<SaleDtos.InvoiceItemResponse> items = invoice.getItems().stream()
                .sorted(Comparator.comparing(InvoiceItem::getId))
                .map(i -> new SaleDtos.InvoiceItemResponse(i.getId(), i.getVariant().getId(), i.getProductName(),
                        i.getSku(), i.getSize(), i.getColor(), i.getHsnCode(), i.getQuantity(), i.getUnitPrice(),
                        i.getMrp(), i.getDiscountPercent(), i.getDiscountAmount(), i.getTaxRate(),
                        i.isTaxInclusive(), i.getTaxableAmount(), i.getTaxAmount(), i.getLineTotal(),
                        i.getCostPrice(), i.getCostAmount(), i.getReturnedQuantity()))
                .toList();
        List<SaleDtos.InvoiceChargeResponse> charges = invoice.getCharges().stream()
                .map(c -> new SaleDtos.InvoiceChargeResponse(c.getId(), c.getName(), c.getAmount(),
                        c.isTaxable(), c.getTaxRate(), c.getTaxAmount()))
                .toList();
        List<SaleDtos.InvoicePaymentResponse> payments = paymentRepository
                .findByInvoiceIdAndStatusOrderByIdAsc(invoice.getId(), "POSTED").stream()
                .map(p -> new SaleDtos.InvoicePaymentResponse(p.getId(), p.getPaymentNo(), p.getType().name(),
                        p.getMethod().name(), p.getAmount(), p.getReference(), p.getStatus(), p.getPostedAt()))
                .toList();
        return new SaleDtos.InvoiceResponse(invoice.getId(), invoice.getInvoiceNo(), invoice.getFinancialYear(),
                invoice.getBranch().getId(), invoice.getBranch().getName(), invoice.getInvoiceDate(),
                invoice.getStatus().name(), invoice.getCustomer() == null ? null : invoice.getCustomer().getId(),
                invoice.getCustomerName(), invoice.getCustomerPhone(), invoice.getCustomerGstin(),
                invoice.getPlaceOfSupplyStateCode(), invoice.getSubtotal(), invoice.getItemDiscount(),
                invoice.getBillDiscount(), invoice.getAdditionalCharges(), invoice.getTaxableAmount(),
                invoice.getTaxTotal(), invoice.getRoundOff(), invoice.getTotal(), invoice.getPaidAmount(),
                invoice.getBalanceAmount(), invoice.getCostOfGoods(), invoice.getGrossProfit(),
                invoice.isGstEnabled(), invoice.isTaxInclusive(), invoice.getNotes(),
                invoice.getOriginalInvoiceId(), invoice.getAmendmentReason(), invoice.getCreatedByName(),
                invoice.getDeviceId(), invoice.getOfflineId(), invoice.getClientInvoiceRef(), invoice.getSource(),
                invoice.getJournalEntryId(), invoice.getCostJournalEntryId(), invoice.getPostedAt(),
                invoice.getCancelledAt(), invoice.getCancelReason(), items, charges, payments);
    }

    private SaleDtos.HeldBillResponse heldBillResponse(HeldBill held) {
        return new SaleDtos.HeldBillResponse(held.getId(), held.getBranch().getId(), held.getLabel(),
                held.getCustomerId(), held.getDataJson(), held.getCreatedBy(), held.getCreatedAt());
    }

    private SaleDtos.InvoiceResponse storedInvoice(IdempotencyRecord record) {
        try {
            Long invoiceId = objectMapper.readTree(record.getResponseBody()).path("invoiceId").asLong();
            Invoice invoice = invoiceRepository.findByIdAndBusinessId(invoiceId, record.getBusinessId())
                    .orElseThrow(() -> ApiException.conflict("IDEMPOTENCY_STALE",
                            "The stored idempotent response no longer exists."));
            return invoiceResponse(invoice);
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw ApiException.conflict("IDEMPOTENCY_CORRUPT", "The stored idempotent response could not be read.");
        }
    }

    private String hash(Object value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(objectMapper.writeValueAsString(value).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not hash request", ex);
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    public record CreateContext(String source, String idempotencyKey, String offlineId) {
        public static CreateContext online(String idempotencyKey) {
            return new CreateContext("ONLINE", idempotencyKey, null);
        }

        public static CreateContext offline(String offlineId) {
            return new CreateContext("OFFLINE", null, offlineId);
        }
    }

    private static final class Line {
        private final ProductVariant variant;
        private final int quantity;
        private final BigDecimal unitPrice;
        private final BigDecimal discountPercent;
        private final BigDecimal itemDiscount;
        private final BigDecimal gross;
        private final BigDecimal taxRate;
        private final boolean taxInclusive;
        private BigDecimal taxableBefore;
        private BigDecimal taxBefore;
        private BigDecimal lineTotalBefore;
        private BigDecimal taxable;
        private BigDecimal tax;
        private BigDecimal lineTotal;
        private BigDecimal allocatedBillDiscount = BigDecimal.ZERO;
        private final String hsnCode;

        private Line(ProductVariant variant, int quantity, BigDecimal unitPrice, BigDecimal discountPercent,
                     BigDecimal itemDiscount, BigDecimal gross, BigDecimal taxRate, boolean taxInclusive,
                     BigDecimal taxableBefore, BigDecimal taxBefore, BigDecimal lineTotalBefore,
                     BigDecimal allocatedBillDiscount, BigDecimal taxable, BigDecimal tax,
                     BigDecimal lineTotal, String hsnCode) {
            this.variant = variant;
            this.quantity = quantity;
            this.unitPrice = unitPrice;
            this.discountPercent = discountPercent;
            this.itemDiscount = itemDiscount;
            this.gross = gross;
            this.taxRate = taxRate;
            this.taxInclusive = taxInclusive;
            this.taxableBefore = taxableBefore;
            this.taxBefore = taxBefore;
            this.lineTotalBefore = lineTotalBefore;
            this.allocatedBillDiscount = allocatedBillDiscount;
            this.taxable = taxable;
            this.tax = tax;
            this.lineTotal = lineTotal;
            this.hsnCode = hsnCode;
        }

        ProductVariant variant() { return variant; }
        int quantity() { return quantity; }
        BigDecimal unitPrice() { return unitPrice; }
        BigDecimal discountPercent() { return discountPercent; }
        BigDecimal itemDiscount() { return itemDiscount; }
        BigDecimal gross() { return gross; }
        BigDecimal taxRate() { return taxRate; }
        boolean taxInclusive() { return taxInclusive; }
        BigDecimal taxable() { return taxable; }
        BigDecimal tax() { return tax; }
        BigDecimal lineTotal() { return lineTotal; }
        BigDecimal lineTotalBefore() { return lineTotalBefore; }
        BigDecimal allocatedBillDiscount() { return allocatedBillDiscount; }
        String hsnCode() { return hsnCode; }
    }

    private record ChargeLine(String name, BigDecimal amount, boolean taxable, BigDecimal taxRate,
                              BigDecimal tax) {
    }

    private record PaymentLine(PaymentMethod method, BigDecimal amount, String reference) {
    }

    private record NegativeApproval(User approver, Map<Long, Integer> shortages, String reason) {
    }
}
