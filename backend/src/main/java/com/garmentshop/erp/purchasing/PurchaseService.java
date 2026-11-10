package com.garmentshop.erp.purchasing;

import com.garmentshop.erp.accounting.AccountingService;
import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.common.PageResponse;
import com.garmentshop.erp.common.SequenceService;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.InvoiceStatus;
import com.garmentshop.erp.domain.JournalEntry;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.PaymentMethod;
import com.garmentshop.erp.domain.ProductVariant;
import com.garmentshop.erp.domain.PurchaseInvoice;
import com.garmentshop.erp.domain.PurchaseInvoiceItem;
import com.garmentshop.erp.domain.PurchaseInvoiceStatus;
import com.garmentshop.erp.domain.PurchaseOrder;
import com.garmentshop.erp.domain.PurchaseOrderItem;
import com.garmentshop.erp.domain.PurchaseOrderStatus;
import com.garmentshop.erp.domain.PurchaseReturn;
import com.garmentshop.erp.domain.PurchaseReturnItem;
import com.garmentshop.erp.domain.StockMovementType;
import com.garmentshop.erp.domain.Supplier;
import com.garmentshop.erp.domain.SupplierPayment;
import com.garmentshop.erp.domain.TaxCategory;
import com.garmentshop.erp.inventory.StockLedger;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.ProductVariantRepository;
import com.garmentshop.erp.repository.PurchaseInvoiceRepository;
import com.garmentshop.erp.repository.PurchaseOrderRepository;
import com.garmentshop.erp.repository.PurchaseReturnRepository;
import com.garmentshop.erp.repository.SupplierPaymentRepository;
import com.garmentshop.erp.repository.SupplierRepository;
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
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class PurchaseService {

    private final PurchaseOrderRepository orderRepository;
    private final PurchaseInvoiceRepository invoiceRepository;
    private final PurchaseReturnRepository returnRepository;
    private final SupplierPaymentRepository supplierPaymentRepository;
    private final SupplierRepository supplierRepository;
    private final ProductVariantRepository variantRepository;
    private final BusinessRepository businessRepository;
    private final StockLedger stockLedger;
    private final AccountingService accountingService;
    private final SequenceService sequenceService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    // ---------- Purchase orders ----------

    @Transactional(readOnly = true)
    public List<PurchaseDtos.OrderResponse> orders(String status) {
        Long businessId = currentUserService.businessId();
        List<PurchaseOrder> orders;
        if (status == null || status.isBlank()) {
            orders = orderRepository.findByBusinessIdOrderByIdDesc(businessId);
        } else {
            PurchaseOrderStatus parsed = parseOrderStatus(status);
            orders = orderRepository.findByBusinessIdAndStatusOrderByIdDesc(businessId, parsed);
        }
        return orders.stream().map(this::orderResponse).toList();
    }

    @Transactional(readOnly = true)
    public PurchaseDtos.OrderResponse order(Long id) {
        return orderResponse(orderRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Purchase order not found.")));
    }

    @Transactional
    public PurchaseDtos.OrderResponse createOrder(PurchaseDtos.CreateOrderRequest request) {
        currentUserService.requirePermission(Permissions.PURCHASE_MANAGE);
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(request.branchId());
        Supplier supplier = supplierRepository.findByIdAndBusinessId(request.supplierId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Supplier not found."));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        LocalDate orderDate = request.orderDate() == null ? LocalDate.now() : request.orderDate();
        PurchaseOrder order = new PurchaseOrder();
        order.setBusinessId(businessId);
        order.setBranch(branch);
        order.setSupplier(supplier);
        order.setOrderNo(sequenceService.next(businessId, "PURCHASE_ORDER", "PO",
                FinancialYear.of(orderDate, business.getFinancialYearStartMonth()).label()));
        order.setOrderDate(orderDate);
        order.setExpectedDate(request.expectedDate());
        order.setNotes(request.notes());
        order.setStatus(PurchaseOrderStatus.DRAFT);
        order.setCreatedBy(currentUserService.userId());
        Map<Long, Boolean> seen = new HashMap<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal taxTotal = BigDecimal.ZERO;
        for (PurchaseDtos.OrderItemRequest itemRequest : request.items()) {
            if (seen.put(itemRequest.variantId(), true) != null) {
                throw ApiException.badRequest("DUPLICATE_ITEM", "Each variant can appear only once in a purchase order.");
            }
            ProductVariant variant = variantRepository.findByIdAndBusinessId(itemRequest.variantId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Variant not found."));
            BigDecimal unitCost = Money.of(itemRequest.unitCost());
            BigDecimal rate = business.isGstEnabled() ? resolveTaxRate(itemRequest.taxRate(), variant) : BigDecimal.ZERO;
            BigDecimal net = Money.of(unitCost.multiply(BigDecimal.valueOf(itemRequest.quantity())));
            BigDecimal tax = Money.of(net.multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
            PurchaseOrderItem item = new PurchaseOrderItem();
            item.setPurchaseOrder(order);
            item.setVariant(variant);
            item.setQuantityOrdered(itemRequest.quantity());
            item.setUnitCost(unitCost);
            item.setTaxRate(rate);
            item.setLineTotal(net.add(tax));
            order.getItems().add(item);
            subtotal = subtotal.add(net);
            taxTotal = taxTotal.add(tax);
        }
        order.setSubtotal(Money.of(subtotal));
        order.setTaxTotal(Money.of(taxTotal));
        order.setTotal(Money.of(subtotal.add(taxTotal)));
        orderRepository.save(order);
        auditService.log("PURCHASE_ORDER_CREATED", "PURCHASE_ORDER", order.getId(), null,
                Map.of("orderNo", order.getOrderNo(), "supplier", supplier.getName(), "total", order.getTotal()),
                "Purchase order created", branch.getId(), null);
        return orderResponse(order);
    }

    @Transactional
    public PurchaseDtos.OrderResponse approveOrder(Long id) {
        currentUserService.requirePermission(Permissions.PURCHASE_APPROVE);
        PurchaseOrder order = orderRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Purchase order not found."));
        currentUserService.assertBranch(order.getBranch().getId());
        if (order.getStatus() != PurchaseOrderStatus.DRAFT) {
            throw ApiException.badRequest("INVALID_ORDER_STATUS", "Only draft orders can be approved.");
        }
        order.setStatus(PurchaseOrderStatus.ORDERED);
        order.setApprovedBy(currentUserService.userId());
        orderRepository.save(order);
        auditService.log("PURCHASE_ORDER_APPROVED", "PURCHASE_ORDER", id, Map.of("status", "DRAFT"),
                Map.of("status", "ORDERED"), "Purchase order approved", order.getBranch().getId(), null);
        return orderResponse(order);
    }

    @Transactional
    public PurchaseDtos.OrderResponse cancelOrder(Long id) {
        currentUserService.requirePermission(Permissions.PURCHASE_MANAGE);
        PurchaseOrder order = orderRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Purchase order not found."));
        currentUserService.assertBranch(order.getBranch().getId());
        if (order.getStatus() != PurchaseOrderStatus.DRAFT && order.getStatus() != PurchaseOrderStatus.ORDERED) {
            throw ApiException.badRequest("INVALID_ORDER_STATUS", "This order cannot be cancelled.");
        }
        if (order.getItems().stream().anyMatch(i -> i.getQuantityReceived() > 0)) {
            throw ApiException.badRequest("ORDER_RECEIVED", "An order with receipts cannot be cancelled.");
        }
        PurchaseOrderStatus previous = order.getStatus();
        order.setStatus(PurchaseOrderStatus.CANCELLED);
        orderRepository.save(order);
        auditService.log("PURCHASE_ORDER_CANCELLED", "PURCHASE_ORDER", id,
                Map.of("status", previous.name()), Map.of("status", "CANCELLED"),
                "Purchase order cancelled", order.getBranch().getId(), null);
        return orderResponse(order);
    }

    // ---------- Purchase invoices ----------

    @Transactional(readOnly = true)
    public PageResponse<PurchaseDtos.PurchaseInvoiceResponse> invoices(Long branchId, LocalDate from, LocalDate to,
                                                                      String q, int page, int size) {
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        Page<PurchaseInvoice> result = invoiceRepository.search(currentUserService.businessId(), branchId, from, to,
                blankToNull(q), PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                        Sort.by(Sort.Direction.DESC, "invoiceDate").and(Sort.by(Sort.Direction.DESC, "id"))));
        return PageResponse.of(result, this::invoiceResponse);
    }

    @Transactional(readOnly = true)
    public PurchaseDtos.PurchaseInvoiceResponse invoice(Long id) {
        PurchaseInvoice invoice = invoiceRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Purchase invoice not found."));
        currentUserService.assertBranch(invoice.getBranch().getId());
        return invoiceResponse(invoice);
    }

    @Transactional
    public PurchaseDtos.PurchaseInvoiceResponse createInvoice(PurchaseDtos.CreateInvoiceRequest request) {
        currentUserService.requirePermission(Permissions.PURCHASE_MANAGE);
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(request.branchId());
        Supplier supplier = supplierRepository.findByIdAndBusinessId(request.supplierId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Supplier not found."));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        if (invoiceRepository.existsBySupplierIdAndSupplierInvoiceNoIgnoreCase(supplier.getId(),
                request.supplierInvoiceNo().trim())) {
            throw ApiException.conflict("DUPLICATE_SUPPLIER_INVOICE",
                    "This supplier invoice number has already been recorded for the supplier.");
        }
        PurchaseOrder purchaseOrder = null;
        Map<Long, PurchaseOrderItem> orderItems = new HashMap<>();
        if (request.purchaseOrderId() != null) {
            purchaseOrder = orderRepository.findByIdAndBusinessId(request.purchaseOrderId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Purchase order not found."));
            if (!purchaseOrder.getBranch().getId().equals(branch.getId())
                    || !purchaseOrder.getSupplier().getId().equals(supplier.getId())) {
                throw ApiException.badRequest("ORDER_MISMATCH",
                        "The purchase order belongs to a different branch or supplier.");
            }
            if (purchaseOrder.getStatus() != PurchaseOrderStatus.ORDERED
                    && purchaseOrder.getStatus() != PurchaseOrderStatus.PARTIALLY_RECEIVED) {
                throw ApiException.badRequest("INVALID_ORDER_STATUS",
                        "Only ordered or partially received purchase orders can be invoiced.");
            }
            for (PurchaseOrderItem orderItem : purchaseOrder.getItems()) {
                orderItems.put(orderItem.getVariant().getId(), orderItem);
            }
        }
        LocalDate invoiceDate = request.invoiceDate() == null ? LocalDate.now() : request.invoiceDate();
        PurchaseInvoice invoice = new PurchaseInvoice();
        invoice.setBusinessId(businessId);
        invoice.setBranch(branch);
        invoice.setSupplier(supplier);
        invoice.setInternalNo(sequenceService.next(businessId, "PURCHASE_INVOICE", "PUR",
                FinancialYear.of(invoiceDate, business.getFinancialYearStartMonth()).label()));
        invoice.setSupplierInvoiceNo(request.supplierInvoiceNo().trim());
        invoice.setInvoiceDate(invoiceDate);
        invoice.setStatus(PurchaseInvoiceStatus.POSTED);
        invoice.setNotes(request.notes());
        invoice.setCreatedBy(currentUserService.userId());
        invoice.setPostedAt(Instant.now());
        invoice.setPurchaseOrderId(purchaseOrder == null ? null : purchaseOrder.getId());
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal discountTotal = BigDecimal.ZERO;
        BigDecimal taxTotal = BigDecimal.ZERO;
        BigDecimal netTotal = BigDecimal.ZERO;
        Map<Long, Integer> receivedNow = new LinkedHashMap<>();
        Map<Long, Boolean> seen = new HashMap<>();
        for (PurchaseDtos.InvoiceItemRequest itemRequest : request.items()) {
            if (seen.put(itemRequest.variantId(), true) != null) {
                throw ApiException.badRequest("DUPLICATE_ITEM", "Each variant can appear only once on a purchase invoice.");
            }
            ProductVariant variant = variantRepository.findByIdAndBusinessId(itemRequest.variantId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Variant not found."));
            if (purchaseOrder != null) {
                PurchaseOrderItem orderItem = orderItems.get(variant.getId());
                if (orderItem == null) {
                    throw ApiException.badRequest("ITEM_NOT_ON_ORDER",
                            "Variant " + variant.getSku() + " is not on the selected purchase order.");
                }
                int remaining = orderItem.getQuantityOrdered() - orderItem.getQuantityReceived();
                if (itemRequest.quantity() > remaining) {
                    throw ApiException.badRequest("OVER_RECEIPT",
                            "Receiving " + itemRequest.quantity() + " of " + variant.getSku()
                                    + " exceeds the remaining " + remaining + ".");
                }
                receivedNow.merge(variant.getId(), itemRequest.quantity(), Integer::sum);
            }
            BigDecimal unitCost = Money.of(itemRequest.unitCost());
            BigDecimal gross = Money.of(unitCost.multiply(BigDecimal.valueOf(itemRequest.quantity())));
            BigDecimal discount = itemRequest.discountAmount() == null ? Money.ZERO : Money.of(itemRequest.discountAmount());
            if (discount.compareTo(gross) > 0) {
                throw ApiException.badRequest("DISCOUNT_TOO_HIGH", "Line discount cannot exceed the line value.");
            }
            BigDecimal net = gross.subtract(discount);
            BigDecimal rate = business.isGstEnabled() ? resolveTaxRate(itemRequest.taxRate(), variant) : BigDecimal.ZERO;
            BigDecimal tax = Money.of(net.multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
            PurchaseInvoiceItem item = new PurchaseInvoiceItem();
            item.setPurchaseInvoice(invoice);
            item.setVariant(variant);
            item.setQuantity(itemRequest.quantity());
            item.setUnitCost(unitCost);
            item.setDiscountAmount(discount);
            item.setTaxRate(rate);
            item.setTaxAmount(tax);
            item.setLineTotal(Money.of(net.add(tax)));
            item.setHsnCode(itemRequest.hsnCode() == null ? variant.getProduct().getHsnCode() : itemRequest.hsnCode());
            item.setProductName(variant.getProduct().getName());
            invoice.getItems().add(item);
            subtotal = subtotal.add(gross);
            discountTotal = discountTotal.add(discount);
            taxTotal = taxTotal.add(tax);
            netTotal = netTotal.add(net);
        }
        invoice.setSubtotal(Money.of(subtotal));
        invoice.setDiscountAmount(Money.of(discountTotal));
        invoice.setTaxTotal(Money.of(taxTotal));
        invoice.setTotal(Money.of(netTotal.add(taxTotal)));
        invoice.setPaidAmount(Money.ZERO);
        invoiceRepository.save(invoice);

        BigDecimal netUnitCost;
        for (PurchaseInvoiceItem item : invoice.getItems()) {
            netUnitCost = item.getUnitCost().subtract(item.getQuantity() == 0 ? BigDecimal.ZERO
                    : item.getDiscountAmount().divide(BigDecimal.valueOf(item.getQuantity()), 4, RoundingMode.HALF_UP));
            stockLedger.receive(branch, item.getVariant(), item.getQuantity(), netUnitCost,
                    business.getCostingMethod(), StockMovementType.PURCHASE, invoiceDate,
                    "Purchase " + invoice.getInternalNo(), "PURCHASE_INVOICE", invoice.getInternalNo(),
                    currentUserService.userId(), currentUserService.require().getFullName(), null);
            item.getVariant().setPurchasePrice(Money.of(netUnitCost));
            variantRepository.save(item.getVariant());
        }
        UserPrincipal principal = currentUserService.require();
        List<AccountingService.Line> journalLines = new ArrayList<>();
        journalLines.add(AccountingService.debit(AccountingService.INVENTORY, netTotal,
                "Inventory received " + invoice.getInternalNo()));
        if (taxTotal.signum() > 0) {
            journalLines.add(AccountingService.debit(AccountingService.INPUT_GST, taxTotal, "Input GST"));
        }
        journalLines.add(AccountingService.credit(AccountingService.PAYABLE, invoice.getTotal(),
                "Supplier invoice " + invoice.getSupplierInvoiceNo()));
        JournalEntry journal = accountingService.post(businessId, branch, invoiceDate,
                "Purchase " + invoice.getInternalNo() + " from " + supplier.getName(),
                JournalSource.PURCHASE, invoice.getInternalNo(), journalLines,
                principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
        invoice.setJournalEntryId(journal.getId());
        invoiceRepository.save(invoice);

        if (purchaseOrder != null) {
            boolean allReceived = true;
            for (PurchaseOrderItem orderItem : purchaseOrder.getItems()) {
                Integer received = receivedNow.get(orderItem.getVariant().getId());
                if (received != null) {
                    orderItem.setQuantityReceived(orderItem.getQuantityReceived() + received);
                }
                if (orderItem.getQuantityReceived() < orderItem.getQuantityOrdered()) {
                    allReceived = false;
                }
            }
            purchaseOrder.setStatus(allReceived ? PurchaseOrderStatus.RECEIVED
                    : PurchaseOrderStatus.PARTIALLY_RECEIVED);
            orderRepository.save(purchaseOrder);
        }
        auditService.log("PURCHASE_INVOICE_POSTED", "PURCHASE_INVOICE", invoice.getId(), null,
                Map.of("internalNo", invoice.getInternalNo(), "supplierInvoiceNo", invoice.getSupplierInvoiceNo(),
                        "total", invoice.getTotal()), "Purchase invoice posted", branch.getId(), null);
        return invoiceResponse(invoice);
    }

    // ---------- Supplier payments ----------

    @Transactional(readOnly = true)
    public List<PurchaseDtos.SupplierPaymentResponse> supplierPayments(Long supplierId) {
        return supplierPaymentRepository.findByBusinessIdOrderByIdDesc(currentUserService.businessId()).stream()
                .filter(p -> supplierId == null || p.getSupplier().getId().equals(supplierId))
                .map(this::paymentResponse).toList();
    }

    @Transactional
    public PurchaseDtos.SupplierPaymentResponse paySupplier(PurchaseDtos.SupplierPaymentRequest request) {
        currentUserService.requirePermission(Permissions.PURCHASE_PAY);
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(request.branchId());
        Supplier supplier = supplierRepository.findByIdAndBusinessId(request.supplierId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Supplier not found."));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        PaymentMethod method = parseSupplierPaymentMethod(request.method());
        BigDecimal amount = Money.of(request.amount());
        PurchaseInvoice invoice = null;
        if (request.purchaseInvoiceId() != null) {
            invoice = invoiceRepository.findByIdAndBusinessId(request.purchaseInvoiceId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Purchase invoice not found."));
            if (!invoice.getSupplier().getId().equals(supplier.getId())) {
                throw ApiException.badRequest("SUPPLIER_MISMATCH", "The invoice belongs to another supplier.");
            }
            if (invoice.getStatus() != PurchaseInvoiceStatus.POSTED) {
                throw ApiException.badRequest("INVOICE_NOT_POSTED", "Only posted purchase invoices can be paid.");
            }
            BigDecimal remaining = invoice.getTotal().subtract(invoice.getPaidAmount());
            if (amount.compareTo(remaining) > 0) {
                throw ApiException.badRequest("PAYMENT_EXCEEDS_BALANCE",
                        "Payment exceeds the invoice balance of " + Money.of(remaining) + ".");
            }
        }
        LocalDate paymentDate = request.paymentDate() == null ? LocalDate.now() : request.paymentDate();
        SupplierPayment payment = new SupplierPayment();
        payment.setBusinessId(businessId);
        payment.setBranch(branch);
        payment.setSupplier(supplier);
        payment.setPaymentNo(sequenceService.next(businessId, "SUPPLIER_PAYMENT", "SPAY",
                FinancialYear.of(paymentDate, business.getFinancialYearStartMonth()).label()));
        payment.setPurchaseInvoiceId(invoice == null ? null : invoice.getId());
        payment.setPaymentDate(paymentDate);
        payment.setAmount(amount);
        payment.setMethod(method);
        payment.setReference(request.reference());
        payment.setNotes(request.notes());
        payment.setStatus("POSTED");
        payment.setCreatedBy(currentUserService.userId());
        payment.setPostedAt(Instant.now());
        supplierPaymentRepository.save(payment);
        UserPrincipal principal = currentUserService.require();
        JournalEntry journal = accountingService.post(businessId, branch, paymentDate,
                "Supplier payment " + payment.getPaymentNo() + " to " + supplier.getName(),
                JournalSource.SUPPLIER_PAYMENT, payment.getPaymentNo(),
                List.of(AccountingService.debit(AccountingService.PAYABLE, amount, "Supplier payment"),
                        AccountingService.credit(assetAccount(method), amount, "Payment (" + method + ")")),
                principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
        payment.setJournalEntryId(journal.getId());
        supplierPaymentRepository.save(payment);
        if (invoice != null) {
            invoice.setPaidAmount(Money.of(invoice.getPaidAmount().add(amount)));
            invoiceRepository.save(invoice);
        }
        auditService.log("SUPPLIER_PAYMENT_POSTED", "SUPPLIER_PAYMENT", payment.getId(), null,
                Map.of("paymentNo", payment.getPaymentNo(), "amount", amount, "method", method.name()),
                "Supplier payment posted", branch.getId(), null);
        return paymentResponse(payment);
    }

    // ---------- Purchase returns ----------

    @Transactional(readOnly = true)
    public List<PurchaseDtos.PurchaseReturnResponse> returns() {
        return returnRepository.findByBusinessIdOrderByIdDesc(currentUserService.businessId()).stream()
                .map(this::returnResponse).toList();
    }

    @Transactional
    public PurchaseDtos.PurchaseReturnResponse createReturn(PurchaseDtos.CreateReturnRequest request) {
        currentUserService.requirePermission(Permissions.PURCHASE_MANAGE);
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(request.branchId());
        Supplier supplier = supplierRepository.findByIdAndBusinessId(request.supplierId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Supplier not found."));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        PurchaseInvoice invoice = null;
        Map<Long, PurchaseInvoiceItem> invoiceItems = new HashMap<>();
        if (request.purchaseInvoiceId() != null) {
            invoice = invoiceRepository.findByIdAndBusinessId(request.purchaseInvoiceId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Purchase invoice not found."));
            if (!invoice.getSupplier().getId().equals(supplier.getId())) {
                throw ApiException.badRequest("SUPPLIER_MISMATCH", "The invoice belongs to another supplier.");
            }
            for (PurchaseInvoiceItem item : invoice.getItems()) {
                invoiceItems.put(item.getVariant().getId(), item);
            }
        }
        LocalDate returnDate = request.returnDate() == null ? LocalDate.now() : request.returnDate();
        PurchaseReturn purchaseReturn = new PurchaseReturn();
        purchaseReturn.setBusinessId(businessId);
        purchaseReturn.setBranch(branch);
        purchaseReturn.setSupplier(supplier);
        purchaseReturn.setPurchaseInvoice(invoice);
        purchaseReturn.setReturnNo(sequenceService.next(businessId, "PURCHASE_RETURN", "PRT",
                FinancialYear.of(returnDate, business.getFinancialYearStartMonth()).label()));
        purchaseReturn.setReturnDate(returnDate);
        purchaseReturn.setReason(request.reason());
        purchaseReturn.setStatus(InvoiceStatus.POSTED);
        purchaseReturn.setCreatedBy(currentUserService.userId());
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal taxTotal = BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal actualInventoryCost = BigDecimal.ZERO;
        UserPrincipal principal = currentUserService.require();
        for (PurchaseDtos.ReturnItemRequest itemRequest : request.items()) {
            ProductVariant variant = variantRepository.findByIdAndBusinessId(itemRequest.variantId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Variant not found."));
            PurchaseInvoiceItem invoiceItem = null;
            if (invoice != null) {
                invoiceItem = invoiceItems.get(variant.getId());
                if (invoiceItem == null) {
                    throw ApiException.badRequest("ITEM_NOT_ON_INVOICE",
                            "Variant " + variant.getSku() + " is not on the selected purchase invoice.");
                }
                int available = invoiceItem.getQuantity() - invoiceItem.getReturnedQuantity();
                if (itemRequest.quantity() > available) {
                    throw ApiException.badRequest("OVER_RETURN",
                            "Returning " + itemRequest.quantity() + " of " + variant.getSku()
                                    + " exceeds the unreturned quantity " + available + ".");
                }
            }
            StockLedger.StockResult issued = stockLedger.issue(branch, variant, itemRequest.quantity(),
                    business.getCostingMethod(), StockMovementType.PURCHASE_RETURN, returnDate,
                    "Purchase return " + purchaseReturn.getReturnNo(), "PURCHASE_RETURN",
                    purchaseReturn.getReturnNo(), principal.getId(), principal.getFullName(), null, false);
            BigDecimal unitCost = Money.of(itemRequest.unitCost());
            BigDecimal net = Money.of(unitCost.multiply(BigDecimal.valueOf(itemRequest.quantity())));
            BigDecimal rate = business.isGstEnabled() ? resolveTaxRate(itemRequest.taxRate(), variant) : BigDecimal.ZERO;
            BigDecimal tax = Money.of(net.multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
            PurchaseReturnItem item = new PurchaseReturnItem();
            item.setPurchaseReturn(purchaseReturn);
            item.setVariant(variant);
            item.setQuantity(itemRequest.quantity());
            item.setUnitCost(unitCost);
            item.setTaxRate(rate);
            item.setTaxAmount(tax);
            item.setLineTotal(Money.of(net.add(tax)));
            purchaseReturn.getItems().add(item);
            subtotal = subtotal.add(net);
            taxTotal = taxTotal.add(tax);
            total = total.add(net).add(tax);
            actualInventoryCost = actualInventoryCost.add(issued.totalCost());
            if (invoiceItem != null) {
                invoiceItem.setReturnedQuantity(invoiceItem.getReturnedQuantity() + itemRequest.quantity());
            }
        }
        purchaseReturn.setSubtotal(Money.of(subtotal));
        purchaseReturn.setTaxTotal(Money.of(taxTotal));
        purchaseReturn.setTotal(Money.of(total));
        returnRepository.save(purchaseReturn);

        List<AccountingService.Line> journalLines = new ArrayList<>();
        journalLines.add(AccountingService.debit(AccountingService.PAYABLE, total,
                "Purchase return " + purchaseReturn.getReturnNo()));
        journalLines.add(AccountingService.credit(AccountingService.INVENTORY, actualInventoryCost,
                "Inventory returned"));
        if (taxTotal.signum() > 0) {
            journalLines.add(AccountingService.credit(AccountingService.INPUT_GST, taxTotal, "Input GST reversed"));
        }
        BigDecimal variance = Money.of(total.subtract(actualInventoryCost).subtract(taxTotal));
        if (variance.signum() > 0) {
            journalLines.add(AccountingService.credit(AccountingService.INVENTORY_SHRINKAGE, variance,
                    "Purchase return cost variance"));
        } else if (variance.signum() < 0) {
            journalLines.add(AccountingService.debit(AccountingService.INVENTORY_SHRINKAGE, variance.abs(),
                    "Purchase return cost variance"));
        }
        JournalEntry journal = accountingService.post(businessId, branch, returnDate,
                "Purchase return " + purchaseReturn.getReturnNo() + " to " + supplier.getName(),
                JournalSource.PURCHASE_RETURN, purchaseReturn.getReturnNo(), journalLines,
                principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
        purchaseReturn.setJournalEntryId(journal.getId());
        returnRepository.save(purchaseReturn);
        auditService.log("PURCHASE_RETURN_POSTED", "PURCHASE_RETURN", purchaseReturn.getId(), null,
                Map.of("returnNo", purchaseReturn.getReturnNo(), "total", total), "Purchase return posted",
                branch.getId(), null);
        return returnResponse(purchaseReturn);
    }

    // ---------- Helpers ----------

    private BigDecimal resolveTaxRate(BigDecimal requested, ProductVariant variant) {
        if (requested != null) {
            return Money.of(requested);
        }
        TaxCategory taxCategory = variant.getProduct().getTaxCategory();
        return taxCategory == null ? Money.ZERO : Money.of(taxCategory.getGstRate());
    }

    private PurchaseOrderStatus parseOrderStatus(String raw) {
        try {
            return PurchaseOrderStatus.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_ORDER_STATUS", "Unknown purchase order status.");
        }
    }

    private PaymentMethod parseSupplierPaymentMethod(String raw) {
        try {
            PaymentMethod method = PaymentMethod.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
            if (method == PaymentMethod.CREDIT || method == PaymentMethod.ADVANCE) {
                throw ApiException.badRequest("INVALID_PAYMENT_METHOD",
                        "Supplier payments must use cash, bank, UPI, card or cheque.");
            }
            return method;
        } catch (ApiException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_PAYMENT_METHOD", "Unsupported payment method.");
        }
    }

    private String assetAccount(PaymentMethod method) {
        return switch (method) {
            case CASH -> AccountingService.CASH;
            case UPI -> AccountingService.UPI;
            case CARD -> AccountingService.CARD;
            case BANK, CHEQUE -> AccountingService.BANK;
            default -> throw ApiException.badRequest("INVALID_PAYMENT_METHOD", "Unsupported payment method.");
        };
    }

    private PurchaseDtos.OrderResponse orderResponse(PurchaseOrder order) {
        List<PurchaseDtos.OrderItemResponse> items = order.getItems().stream()
                .map(i -> new PurchaseDtos.OrderItemResponse(i.getId(), i.getVariant().getId(),
                        i.getVariant().getProduct().getName(), i.getVariant().getSku(), i.getQuantityOrdered(),
                        i.getQuantityReceived(), i.getUnitCost(), i.getTaxRate(), i.getLineTotal()))
                .toList();
        return new PurchaseDtos.OrderResponse(order.getId(), order.getOrderNo(), order.getBranch().getId(),
                order.getBranch().getName(), order.getSupplier().getId(), order.getSupplier().getName(),
                order.getStatus().name(), order.getOrderDate(), order.getExpectedDate(), order.getNotes(),
                order.getSubtotal(), order.getTaxTotal(), order.getTotal(), order.getCreatedAt(), items);
    }

    private PurchaseDtos.PurchaseInvoiceResponse invoiceResponse(PurchaseInvoice invoice) {
        List<PurchaseDtos.InvoiceItemResponse> items = invoice.getItems().stream()
                .map(i -> new PurchaseDtos.InvoiceItemResponse(i.getId(), i.getVariant().getId(),
                        i.getProductName(), i.getVariant().getSku(), i.getQuantity(), i.getReturnedQuantity(),
                        i.getUnitCost(), i.getDiscountAmount(), i.getTaxRate(), i.getTaxAmount(),
                        i.getLineTotal(), i.getHsnCode()))
                .toList();
        return new PurchaseDtos.PurchaseInvoiceResponse(invoice.getId(), invoice.getInternalNo(),
                invoice.getSupplierInvoiceNo(), invoice.getBranch().getId(), invoice.getBranch().getName(),
                invoice.getSupplier().getId(), invoice.getSupplier().getName(), invoice.getInvoiceDate(),
                invoice.getStatus().name(), invoice.getSubtotal(), invoice.getDiscountAmount(),
                invoice.getTaxTotal(), invoice.getTotal(), invoice.getPaidAmount(),
                Money.of(invoice.getTotal().subtract(invoice.getPaidAmount())), invoice.getNotes(),
                invoice.getPurchaseOrderId(), invoice.getJournalEntryId(), invoice.getPostedAt(), items);
    }

    private PurchaseDtos.SupplierPaymentResponse paymentResponse(SupplierPayment payment) {
        return new PurchaseDtos.SupplierPaymentResponse(payment.getId(), payment.getPaymentNo(),
                payment.getSupplier().getId(), payment.getSupplier().getName(),
                payment.getPurchaseInvoiceId(), payment.getPaymentDate(), payment.getAmount(),
                payment.getMethod().name(), payment.getReference(), payment.getStatus(),
                payment.getJournalEntryId(), payment.getPostedAt());
    }

    private PurchaseDtos.PurchaseReturnResponse returnResponse(PurchaseReturn purchaseReturn) {
        List<PurchaseDtos.ReturnItemResponse> items = purchaseReturn.getItems().stream()
                .map(i -> new PurchaseDtos.ReturnItemResponse(i.getId(), i.getVariant().getId(),
                        i.getVariant().getProduct().getName(), i.getVariant().getSku(), i.getQuantity(),
                        i.getUnitCost(), i.getTaxRate(), i.getTaxAmount(), i.getLineTotal()))
                .toList();
        return new PurchaseDtos.PurchaseReturnResponse(purchaseReturn.getId(), purchaseReturn.getReturnNo(),
                purchaseReturn.getBranch().getId(), purchaseReturn.getBranch().getName(),
                purchaseReturn.getSupplier().getId(), purchaseReturn.getSupplier().getName(),
                purchaseReturn.getPurchaseInvoice() == null ? null : purchaseReturn.getPurchaseInvoice().getId(),
                purchaseReturn.getReturnDate(), purchaseReturn.getReason(), purchaseReturn.getStatus().name(),
                purchaseReturn.getSubtotal(), purchaseReturn.getTaxTotal(), purchaseReturn.getTotal(),
                purchaseReturn.getJournalEntryId(), items);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
