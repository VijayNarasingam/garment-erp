package com.garmentshop.erp.purchasing;

import com.garmentshop.erp.common.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
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
@RequestMapping("/api/purchasing")
@RequiredArgsConstructor
public class PurchaseController {

    private final PurchaseService purchaseService;

    // ---------- Purchase orders ----------

    @GetMapping("/orders")
    @PreAuthorize("hasAuthority('purchase.view')")
    public List<PurchaseDtos.OrderResponse> orders(@RequestParam(required = false) String status) {
        return purchaseService.orders(status);
    }

    @GetMapping("/orders/{id}")
    @PreAuthorize("hasAuthority('purchase.view')")
    public PurchaseDtos.OrderResponse order(@PathVariable Long id) {
        return purchaseService.order(id);
    }

    @PostMapping("/orders")
    @PreAuthorize("hasAuthority('purchase.manage')")
    public PurchaseDtos.OrderResponse createOrder(@Valid @RequestBody PurchaseDtos.CreateOrderRequest request) {
        return purchaseService.createOrder(request);
    }

    @PostMapping("/orders/{id}/approve")
    @PreAuthorize("hasAuthority('purchase.approve')")
    public PurchaseDtos.OrderResponse approveOrder(@PathVariable Long id) {
        return purchaseService.approveOrder(id);
    }

    @PostMapping("/orders/{id}/cancel")
    @PreAuthorize("hasAuthority('purchase.manage')")
    public PurchaseDtos.OrderResponse cancelOrder(@PathVariable Long id) {
        return purchaseService.cancelOrder(id);
    }

    // ---------- Purchase invoices ----------

    @GetMapping("/invoices")
    @PreAuthorize("hasAuthority('purchase.view')")
    public PageResponse<PurchaseDtos.PurchaseInvoiceResponse> invoices(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return purchaseService.invoices(branchId, from, to, q, page, size);
    }

    @GetMapping("/invoices/{id}")
    @PreAuthorize("hasAuthority('purchase.view')")
    public PurchaseDtos.PurchaseInvoiceResponse invoice(@PathVariable Long id) {
        return purchaseService.invoice(id);
    }

    @PostMapping("/invoices")
    @PreAuthorize("hasAuthority('purchase.manage')")
    public PurchaseDtos.PurchaseInvoiceResponse createInvoice(
            @Valid @RequestBody PurchaseDtos.CreateInvoiceRequest request) {
        return purchaseService.createInvoice(request);
    }

    // ---------- Supplier payments ----------

    @GetMapping("/payments")
    @PreAuthorize("hasAuthority('purchase.view')")
    public List<PurchaseDtos.SupplierPaymentResponse> supplierPayments(
            @RequestParam(required = false) Long supplierId) {
        return purchaseService.supplierPayments(supplierId);
    }

    @PostMapping("/payments")
    @PreAuthorize("hasAuthority('purchase.pay')")
    public PurchaseDtos.SupplierPaymentResponse paySupplier(
            @Valid @RequestBody PurchaseDtos.SupplierPaymentRequest request) {
        return purchaseService.paySupplier(request);
    }

    // ---------- Purchase returns ----------

    @GetMapping("/returns")
    @PreAuthorize("hasAuthority('purchase.view')")
    public List<PurchaseDtos.PurchaseReturnResponse> returns() {
        return purchaseService.returns();
    }

    @PostMapping("/returns")
    @PreAuthorize("hasAuthority('purchase.manage')")
    public PurchaseDtos.PurchaseReturnResponse createReturn(
            @Valid @RequestBody PurchaseDtos.CreateReturnRequest request) {
        return purchaseService.createReturn(request);
    }
}
