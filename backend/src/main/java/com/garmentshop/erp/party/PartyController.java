package com.garmentshop.erp.party;

import com.garmentshop.erp.common.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class PartyController {

    private final PartyService partyService;

    @GetMapping("/customers")
    @PreAuthorize("hasAuthority('customer.view') or hasAuthority('customer.manage') or hasAuthority('pos.bill')")
    public PageResponse<PartyDtos.CustomerResponse> customers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Boolean active,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return partyService.customers(q, active, page, size);
    }

    @GetMapping("/customers/lookup")
    @PreAuthorize("hasAuthority('customer.view') or hasAuthority('pos.bill')")
    public List<PartyDtos.CustomerResponse> customerLookup(@RequestParam(required = false) String q) {
        return partyService.customerLookup(q);
    }

    @GetMapping("/customers/{id}")
    @PreAuthorize("hasAuthority('customer.view') or hasAuthority('customer.manage')")
    public PartyDtos.CustomerResponse customer(@PathVariable Long id) {
        return partyService.customer(id);
    }

    @PostMapping("/customers")
    @PreAuthorize("hasAuthority('customer.manage')")
    public PartyDtos.CustomerResponse createCustomer(@Valid @RequestBody PartyDtos.SaveCustomerRequest request) {
        return partyService.createCustomer(request);
    }

    @PutMapping("/customers/{id}")
    @PreAuthorize("hasAuthority('customer.manage')")
    public PartyDtos.CustomerResponse updateCustomer(@PathVariable Long id,
                                                     @Valid @RequestBody PartyDtos.SaveCustomerRequest request) {
        return partyService.updateCustomer(id, request);
    }

    @GetMapping("/customers/{id}/ledger")
    @PreAuthorize("hasAuthority('customer.view') or hasAuthority('accounting.view')")
    public PartyDtos.CustomerLedger customerLedger(@PathVariable Long id) {
        return partyService.customerLedger(id);
    }

    @GetMapping("/suppliers")
    @PreAuthorize("hasAuthority('supplier.view') or hasAuthority('supplier.manage')")
    public PageResponse<PartyDtos.SupplierResponse> suppliers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Boolean active,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return partyService.suppliers(q, active, page, size);
    }

    @GetMapping("/suppliers/lookup")
    @PreAuthorize("hasAuthority('supplier.view') or hasAuthority('purchase.manage')")
    public List<PartyDtos.SupplierResponse> supplierLookup(@RequestParam(required = false) String q) {
        return partyService.supplierLookup(q);
    }

    @GetMapping("/suppliers/{id}")
    @PreAuthorize("hasAuthority('supplier.view') or hasAuthority('supplier.manage')")
    public PartyDtos.SupplierResponse supplier(@PathVariable Long id) {
        return partyService.supplier(id);
    }

    @PostMapping("/suppliers")
    @PreAuthorize("hasAuthority('supplier.manage')")
    public PartyDtos.SupplierResponse createSupplier(@Valid @RequestBody PartyDtos.SaveSupplierRequest request) {
        return partyService.createSupplier(request);
    }

    @PutMapping("/suppliers/{id}")
    @PreAuthorize("hasAuthority('supplier.manage')")
    public PartyDtos.SupplierResponse updateSupplier(@PathVariable Long id,
                                                     @Valid @RequestBody PartyDtos.SaveSupplierRequest request) {
        return partyService.updateSupplier(id, request);
    }

    @GetMapping("/suppliers/{id}/ledger")
    @PreAuthorize("hasAuthority('supplier.view') or hasAuthority('accounting.view')")
    public PartyDtos.SupplierLedger supplierLedger(@PathVariable Long id) {
        return partyService.supplierLedger(id);
    }
}
