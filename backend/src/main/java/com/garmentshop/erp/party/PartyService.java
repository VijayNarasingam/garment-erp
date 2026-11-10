package com.garmentshop.erp.party;

import com.garmentshop.erp.accounting.AccountingService;
import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.common.PageResponse;
import com.garmentshop.erp.common.SequenceService;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.Customer;
import com.garmentshop.erp.domain.Invoice;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.Payment;
import com.garmentshop.erp.domain.PaymentType;
import com.garmentshop.erp.domain.PurchaseInvoice;
import com.garmentshop.erp.domain.PurchaseReturn;
import com.garmentshop.erp.domain.SalesReturn;
import com.garmentshop.erp.domain.Supplier;
import com.garmentshop.erp.domain.SupplierPayment;
import com.garmentshop.erp.repository.BranchRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.CustomerRepository;
import com.garmentshop.erp.repository.InvoiceRepository;
import com.garmentshop.erp.repository.PaymentRepository;
import com.garmentshop.erp.repository.PurchaseInvoiceRepository;
import com.garmentshop.erp.repository.PurchaseReturnRepository;
import com.garmentshop.erp.repository.SalesReturnRepository;
import com.garmentshop.erp.repository.SupplierPaymentRepository;
import com.garmentshop.erp.repository.SupplierRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import com.garmentshop.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class PartyService {

    private final CustomerRepository customerRepository;
    private final SupplierRepository supplierRepository;
    private final InvoiceRepository invoiceRepository;
    private final PaymentRepository paymentRepository;
    private final SalesReturnRepository salesReturnRepository;
    private final PurchaseInvoiceRepository purchaseInvoiceRepository;
    private final SupplierPaymentRepository supplierPaymentRepository;
    private final PurchaseReturnRepository purchaseReturnRepository;
    private final BusinessRepository businessRepository;
    private final BranchRepository branchRepository;
    private final AccountingService accountingService;
    private final SequenceService sequenceService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    // ---------- Customers ----------

    @Transactional(readOnly = true)
    public PageResponse<PartyDtos.CustomerResponse> customers(String q, Boolean active, int page, int size) {
        return PageResponse.of(customerRepository.search(currentUserService.businessId(), blankToNull(q), active,
                        PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100), Sort.by("name")))
                .map(this::customerResponse));
    }

    @Transactional(readOnly = true)
    public List<PartyDtos.CustomerResponse> customerLookup(String q) {
        Long businessId = currentUserService.businessId();
        String term = blankToNull(q);
        if (term == null) {
            return customerRepository.findByBusinessIdOrderByNameAsc(businessId).stream()
                    .filter(Customer::isActive).limit(25).map(this::customerResponse).toList();
        }
        return customerRepository.search(businessId, term, true,
                        PageRequest.of(0, 25, Sort.by("name"))).getContent().stream()
                .map(this::customerResponse).toList();
    }

    @Transactional(readOnly = true)
    public PartyDtos.CustomerResponse customer(Long id) {
        return customerResponse(customerRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Customer not found.")));
    }

    @Transactional
    public PartyDtos.CustomerResponse createCustomer(PartyDtos.SaveCustomerRequest request) {
        Long businessId = currentUserService.businessId();
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        Customer customer = new Customer();
        customer.setBusiness(business);
        customer.setCode(resolveCustomerCode(request.code(), businessId));
        applyCustomer(customer, request);
        customer.setOpeningBalance(Money.of(request.openingBalance()));
        customerRepository.save(customer);
        postOpeningBalance(business, null, customer.getId(), true, customer.getOpeningBalance(),
                "Customer opening balance: " + customer.getName(), "CUSTOMER:" + customer.getId());
        auditService.log("CUSTOMER_CREATED", "CUSTOMER", customer.getId(), null,
                Map.of("code", customer.getCode(), "name", customer.getName()), "Customer created", null, null);
        return customerResponse(customer);
    }

    @Transactional
    public PartyDtos.CustomerResponse updateCustomer(Long id, PartyDtos.SaveCustomerRequest request) {
        Long businessId = currentUserService.businessId();
        Customer customer = customerRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Customer not found."));
        String code = resolveCustomerCode(request.code(), businessId);
        if (!customer.getCode().equalsIgnoreCase(code)
                && customerRepository.existsByBusinessIdAndCodeIgnoreCase(businessId, code)) {
            throw ApiException.conflict("DUPLICATE_CUSTOMER_CODE", "A customer with this code already exists.");
        }
        BigDecimal requestedOpening = Money.of(request.openingBalance());
        if (requestedOpening.compareTo(customer.getOpeningBalance()) != 0) {
            throw ApiException.badRequest("OPENING_BALANCE_LOCKED",
                    "Opening balances cannot be edited after creation. Post an adjusting entry instead.");
        }
        Map<String, Object> before = Map.of("name", customer.getName(), "active", customer.isActive(),
                "creditLimit", customer.getCreditLimit());
        customer.setCode(code);
        applyCustomer(customer, request);
        customerRepository.save(customer);
        auditService.log("CUSTOMER_UPDATED", "CUSTOMER", customer.getId(), before,
                Map.of("name", customer.getName(), "active", customer.isActive(),
                        "creditLimit", customer.getCreditLimit()), "Customer updated", null, null);
        return customerResponse(customer);
    }

    @Transactional(readOnly = true)
    public PartyDtos.CustomerLedger customerLedger(Long id) {
        Long businessId = currentUserService.businessId();
        Customer customer = customerRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Customer not found."));
        List<PartyDtos.LedgerEntry> raw = new ArrayList<>();
        if (customer.getOpeningBalance().signum() > 0) {
            raw.add(new PartyDtos.LedgerEntry(customer.getCreatedAt() == null ? LocalDate.now()
                    : customer.getCreatedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate(),
                    "OPENING", "—", "Opening balance", customer.getOpeningBalance(), Money.ZERO, Money.ZERO));
        }
        for (Invoice invoice : invoiceRepository.findByCustomer(id, null)) {
            if (invoice.getStatus() != com.garmentshop.erp.domain.InvoiceStatus.POSTED) {
                continue;
            }
            raw.add(new PartyDtos.LedgerEntry(invoice.getInvoiceDate(), "INVOICE", invoice.getInvoiceNo(),
                    "Invoice total", invoice.getTotal(), Money.ZERO, Money.ZERO));
        }
        for (Payment payment : paymentRepository.findByCustomerIdOrderByPaymentDateDescIdDesc(id)) {
            if (!"POSTED".equals(payment.getStatus())) {
                continue;
            }
            if (payment.getType() == PaymentType.CUSTOMER_RECEIPT) {
                raw.add(new PartyDtos.LedgerEntry(payment.getPaymentDate(), "RECEIPT", payment.getPaymentNo(),
                        "Payment received (" + payment.getMethod() + ")", Money.ZERO, payment.getAmount(), Money.ZERO));
            } else if (payment.getType() == PaymentType.CUSTOMER_REFUND) {
                raw.add(new PartyDtos.LedgerEntry(payment.getPaymentDate(), "REFUND", payment.getPaymentNo(),
                        "Refund paid (" + payment.getMethod() + ")", payment.getAmount(), Money.ZERO, Money.ZERO));
            }
        }
        for (SalesReturn salesReturn : salesReturnRepository.findByCustomer(id)) {
            raw.add(new PartyDtos.LedgerEntry(salesReturn.getReturnDate(), "SALES_RETURN",
                    salesReturn.getReturnNo(), "Sales return credit", Money.ZERO, salesReturn.getTotal(), Money.ZERO));
        }
        raw.sort(Comparator.comparing(PartyDtos.LedgerEntry::date).thenComparing(PartyDtos.LedgerEntry::reference));
        BigDecimal running = BigDecimal.ZERO;
        BigDecimal debit = BigDecimal.ZERO;
        BigDecimal credit = BigDecimal.ZERO;
        List<PartyDtos.LedgerEntry> entries = new ArrayList<>();
        for (PartyDtos.LedgerEntry entry : raw) {
            running = running.add(entry.debit()).subtract(entry.credit());
            debit = debit.add(entry.debit());
            credit = credit.add(entry.credit());
            entries.add(new PartyDtos.LedgerEntry(entry.date(), entry.type(), entry.reference(),
                    entry.description(), entry.debit(), entry.credit(), Money.of(running)));
        }
        return new PartyDtos.CustomerLedger(customer.getId(), customer.getName(), customer.getOpeningBalance(),
                Money.of(debit), Money.of(credit), Money.of(running), entries);
    }

    private void applyCustomer(Customer customer, PartyDtos.SaveCustomerRequest request) {
        customer.setName(request.name().trim());
        customer.setPhone(request.phone());
        customer.setEmail(request.email());
        customer.setGstin(request.gstin());
        customer.setAddress(request.address());
        customer.setCity(request.city());
        customer.setState(request.state());
        customer.setStateCode(request.stateCode());
        customer.setCreditLimit(Money.of(request.creditLimit()));
        customer.setDiscountPercent(Money.of(request.discountPercent()));
        customer.setNotes(request.notes());
        customer.setActive(request.active());
    }

    private String resolveCustomerCode(String rawCode, Long businessId) {
        if (rawCode != null && !rawCode.isBlank()) {
            String code = rawCode.trim().toUpperCase();
            if (code.length() > 30) {
                throw ApiException.badRequest("INVALID_CODE", "Customer code cannot exceed 30 characters.");
            }
            return code;
        }
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        return sequenceService.next(businessId, "CUSTOMER", "CUS",
                FinancialYear.current(business.getFinancialYearStartMonth()).label());
    }

    private PartyDtos.CustomerResponse customerResponse(Customer customer) {
        BigDecimal outstanding = invoiceRepository.findByCustomer(customer.getId(), null).stream()
                .filter(i -> i.getStatus() == com.garmentshop.erp.domain.InvoiceStatus.POSTED)
                .map(Invoice::getBalanceAmount).reduce(customer.getOpeningBalance(), BigDecimal::add);
        return new PartyDtos.CustomerResponse(customer.getId(), customer.getCode(), customer.getName(),
                customer.getPhone(), customer.getEmail(), customer.getGstin(), customer.getAddress(),
                customer.getCity(), customer.getState(), customer.getStateCode(), customer.getCreditLimit(),
                customer.getDiscountPercent(), customer.getOpeningBalance(), customer.getNotes(),
                customer.isActive(), Money.of(outstanding));
    }

    // ---------- Suppliers ----------

    @Transactional(readOnly = true)
    public PageResponse<PartyDtos.SupplierResponse> suppliers(String q, Boolean active, int page, int size) {
        return PageResponse.of(supplierRepository.search(currentUserService.businessId(), blankToNull(q), active,
                        PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100), Sort.by("name")))
                .map(this::supplierResponse));
    }

    @Transactional(readOnly = true)
    public List<PartyDtos.SupplierResponse> supplierLookup(String q) {
        Long businessId = currentUserService.businessId();
        String term = blankToNull(q);
        if (term == null) {
            return supplierRepository.findByBusinessIdOrderByNameAsc(businessId).stream()
                    .filter(Supplier::isActive).limit(25).map(this::supplierResponse).toList();
        }
        return supplierRepository.search(businessId, term, true,
                        PageRequest.of(0, 25, Sort.by("name"))).getContent().stream()
                .map(this::supplierResponse).toList();
    }

    @Transactional(readOnly = true)
    public PartyDtos.SupplierResponse supplier(Long id) {
        return supplierResponse(supplierRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Supplier not found.")));
    }

    @Transactional
    public PartyDtos.SupplierResponse createSupplier(PartyDtos.SaveSupplierRequest request) {
        Long businessId = currentUserService.businessId();
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        Supplier supplier = new Supplier();
        supplier.setBusiness(business);
        supplier.setCode(resolveSupplierCode(request.code(), businessId));
        applySupplier(supplier, request);
        supplier.setOpeningBalance(Money.of(request.openingBalance()));
        supplierRepository.save(supplier);
        postOpeningBalance(business, null, supplier.getId(), false, supplier.getOpeningBalance(),
                "Supplier opening balance: " + supplier.getName(), "SUPPLIER:" + supplier.getId());
        auditService.log("SUPPLIER_CREATED", "SUPPLIER", supplier.getId(), null,
                Map.of("code", supplier.getCode(), "name", supplier.getName()), "Supplier created", null, null);
        return supplierResponse(supplier);
    }

    @Transactional
    public PartyDtos.SupplierResponse updateSupplier(Long id, PartyDtos.SaveSupplierRequest request) {
        Long businessId = currentUserService.businessId();
        Supplier supplier = supplierRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Supplier not found."));
        String code = resolveSupplierCode(request.code(), businessId);
        if (!supplier.getCode().equalsIgnoreCase(code)
                && supplierRepository.existsByBusinessIdAndCodeIgnoreCase(businessId, code)) {
            throw ApiException.conflict("DUPLICATE_SUPPLIER_CODE", "A supplier with this code already exists.");
        }
        BigDecimal requestedOpening = Money.of(request.openingBalance());
        if (requestedOpening.compareTo(supplier.getOpeningBalance()) != 0) {
            throw ApiException.badRequest("OPENING_BALANCE_LOCKED",
                    "Opening balances cannot be edited after creation. Post an adjusting entry instead.");
        }
        Map<String, Object> before = Map.of("name", supplier.getName(), "active", supplier.isActive(),
                "paymentTermsDays", supplier.getPaymentTermsDays());
        supplier.setCode(code);
        applySupplier(supplier, request);
        supplierRepository.save(supplier);
        auditService.log("SUPPLIER_UPDATED", "SUPPLIER", supplier.getId(), before,
                Map.of("name", supplier.getName(), "active", supplier.isActive(),
                        "paymentTermsDays", supplier.getPaymentTermsDays()), "Supplier updated", null, null);
        return supplierResponse(supplier);
    }

    @Transactional(readOnly = true)
    public PartyDtos.SupplierLedger supplierLedger(Long id) {
        Long businessId = currentUserService.businessId();
        Supplier supplier = supplierRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Supplier not found."));
        List<PartyDtos.LedgerEntry> raw = new ArrayList<>();
        if (supplier.getOpeningBalance().signum() > 0) {
            raw.add(new PartyDtos.LedgerEntry(supplier.getCreatedAt() == null ? LocalDate.now()
                    : supplier.getCreatedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate(),
                    "OPENING", "—", "Opening balance", Money.ZERO, supplier.getOpeningBalance(), Money.ZERO));
        }
        for (PurchaseInvoice invoice : purchaseInvoiceRepository.findBySupplier(id)) {
            raw.add(new PartyDtos.LedgerEntry(invoice.getInvoiceDate(), "PURCHASE", invoice.getInternalNo(),
                    "Supplier invoice " + invoice.getSupplierInvoiceNo(), Money.ZERO, invoice.getTotal(), Money.ZERO));
        }
        for (SupplierPayment payment : supplierPaymentRepository.findBySupplier(id)) {
            raw.add(new PartyDtos.LedgerEntry(payment.getPaymentDate(), "PAYMENT", payment.getPaymentNo(),
                    "Payment (" + payment.getMethod() + ")", payment.getAmount(), Money.ZERO, Money.ZERO));
        }
        for (PurchaseReturn purchaseReturn : purchaseReturnRepository.findBySupplier(id)) {
            raw.add(new PartyDtos.LedgerEntry(purchaseReturn.getReturnDate(), "PURCHASE_RETURN",
                    purchaseReturn.getReturnNo(), "Purchase return", purchaseReturn.getTotal(), Money.ZERO, Money.ZERO));
        }
        raw.sort(Comparator.comparing(PartyDtos.LedgerEntry::date).thenComparing(PartyDtos.LedgerEntry::reference));
        BigDecimal running = BigDecimal.ZERO;
        BigDecimal debit = BigDecimal.ZERO;
        BigDecimal credit = BigDecimal.ZERO;
        List<PartyDtos.LedgerEntry> entries = new ArrayList<>();
        for (PartyDtos.LedgerEntry entry : raw) {
            running = running.add(entry.credit()).subtract(entry.debit());
            debit = debit.add(entry.debit());
            credit = credit.add(entry.credit());
            entries.add(new PartyDtos.LedgerEntry(entry.date(), entry.type(), entry.reference(),
                    entry.description(), entry.debit(), entry.credit(), Money.of(running)));
        }
        return new PartyDtos.SupplierLedger(supplier.getId(), supplier.getName(), supplier.getOpeningBalance(),
                Money.of(debit), Money.of(credit), Money.of(running), entries);
    }

    private void applySupplier(Supplier supplier, PartyDtos.SaveSupplierRequest request) {
        supplier.setName(request.name().trim());
        supplier.setContactPerson(request.contactPerson());
        supplier.setPhone(request.phone());
        supplier.setEmail(request.email());
        supplier.setGstin(request.gstin());
        supplier.setAddress(request.address());
        supplier.setCity(request.city());
        supplier.setState(request.state());
        supplier.setStateCode(request.stateCode());
        supplier.setPaymentTermsDays(request.paymentTermsDays());
        supplier.setNotes(request.notes());
        supplier.setActive(request.active());
    }

    private String resolveSupplierCode(String rawCode, Long businessId) {
        if (rawCode != null && !rawCode.isBlank()) {
            String code = rawCode.trim().toUpperCase();
            if (code.length() > 30) {
                throw ApiException.badRequest("INVALID_CODE", "Supplier code cannot exceed 30 characters.");
            }
            return code;
        }
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        return sequenceService.next(businessId, "SUPPLIER", "SUP",
                FinancialYear.current(business.getFinancialYearStartMonth()).label());
    }

    private PartyDtos.SupplierResponse supplierResponse(Supplier supplier) {
        BigDecimal payable = purchaseInvoiceRepository.findBySupplier(supplier.getId()).stream()
                .map(i -> i.getTotal().subtract(i.getPaidAmount()))
                .reduce(supplier.getOpeningBalance(), BigDecimal::add);
        return new PartyDtos.SupplierResponse(supplier.getId(), supplier.getCode(), supplier.getName(),
                supplier.getContactPerson(), supplier.getPhone(), supplier.getEmail(), supplier.getGstin(),
                supplier.getAddress(), supplier.getCity(), supplier.getState(), supplier.getStateCode(),
                supplier.getPaymentTermsDays(), supplier.getOpeningBalance(), supplier.getNotes(),
                supplier.isActive(), Money.of(payable));
    }

    private void postOpeningBalance(Business business, Branch branch, Long partyId, boolean customer,
                                    BigDecimal amount, String description, String sourceId) {
        if (amount == null || amount.signum() == 0) {
            return;
        }
        Branch journalBranch = branch;
        if (journalBranch == null) {
            journalBranch = branchRepository.findFirstByBusinessIdAndPrimaryBranchTrue(business.getId())
                    .orElseGet(() -> branchRepository.findByBusinessIdAndActiveTrueOrderByNameAsc(business.getId())
                            .stream().findFirst().orElse(null));
        }
        if (journalBranch == null) {
            throw ApiException.badRequest("NO_BRANCH",
                    "Create a branch before recording opening balances.");
        }
        UserPrincipal principal = currentUserService.require();
        List<AccountingService.Line> lines = customer
                ? List.of(AccountingService.debit(AccountingService.RECEIVABLE, amount, description),
                        AccountingService.credit(AccountingService.OPENING_BALANCE_EQUITY, amount, description))
                : List.of(AccountingService.debit(AccountingService.OPENING_BALANCE_EQUITY, amount, description),
                        AccountingService.credit(AccountingService.PAYABLE, amount, description));
        accountingService.post(business.getId(), journalBranch, LocalDate.now(), description,
                JournalSource.OPENING_BALANCE, sourceId, lines, principal.getId(), principal.getFullName(),
                business.getFinancialYearStartMonth());
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
