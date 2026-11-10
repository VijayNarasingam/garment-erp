package com.garmentshop.erp.sales;

import com.garmentshop.erp.common.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/sales")
@RequiredArgsConstructor
public class SaleController {

    private final SaleService saleService;
    private final InvoicePdfService invoicePdfService;

    @GetMapping("/invoices")
    @PreAuthorize("hasAuthority('invoice.view') or hasAuthority('pos.bill')")
    public PageResponse<SaleDtos.InvoiceResponse> invoices(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return saleService.invoices(branchId, status, from, to, q, page, size);
    }

    @GetMapping("/invoices/{id}")
    @PreAuthorize("hasAuthority('invoice.view') or hasAuthority('pos.bill')")
    public SaleDtos.InvoiceResponse invoice(@PathVariable Long id) {
        return saleService.invoice(id);
    }

    @GetMapping("/invoices/offline/{offlineId}")
    @PreAuthorize("hasAuthority('invoice.view') or hasAuthority('sync.use')")
    public ResponseEntity<SaleDtos.InvoiceResponse> byOfflineId(@PathVariable String offlineId) {
        SaleDtos.InvoiceResponse invoice = saleService.invoiceByOfflineId(offlineId);
        return invoice == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(invoice);
    }

    @PostMapping("/invoices")
    @PreAuthorize("hasAuthority('pos.bill')")
    public SaleDtos.InvoiceResponse create(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody SaleDtos.CreateSaleRequest request) {
        return saleService.create(SaleService.CreateContext.online(idempotencyKey), request);
    }

    @PostMapping("/invoices/{id}/cancel")
    @PreAuthorize("hasAuthority('invoice.cancel') or hasAuthority('pos.void')")
    public SaleDtos.InvoiceResponse cancel(@PathVariable Long id,
                                           @Valid @RequestBody SaleDtos.CancelSaleRequest request) {
        return saleService.cancel(id, request.reason());
    }

    @PostMapping("/invoices/{id}/amend")
    @PreAuthorize("hasAuthority('invoice.amend')")
    public SaleDtos.InvoiceResponse amend(@PathVariable Long id,
                                          @Valid @RequestBody SaleDtos.AmendSaleRequest request) {
        return saleService.amend(id, request);
    }

    @GetMapping("/invoices/{id}/pdf")
    @PreAuthorize("hasAuthority('invoice.view') or hasAuthority('pos.bill')")
    public ResponseEntity<byte[]> pdf(@PathVariable Long id) {
        byte[] pdf = invoicePdfService.render(id);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename("invoice-" + id + ".pdf").build());
        return ResponseEntity.ok().headers(headers).body(pdf);
    }

    @GetMapping("/held-bills")
    @PreAuthorize("hasAuthority('pos.hold')")
    public List<SaleDtos.HeldBillResponse> heldBills(@RequestParam Long branchId) {
        return saleService.heldBills(branchId);
    }

    @PostMapping("/held-bills")
    @PreAuthorize("hasAuthority('pos.hold')")
    public SaleDtos.HeldBillResponse holdBill(@Valid @RequestBody SaleDtos.HeldBillRequest request) {
        return saleService.holdBill(request);
    }

    @DeleteMapping("/held-bills/{id}")
    @PreAuthorize("hasAuthority('pos.hold')")
    public ResponseEntity<Void> deleteHeldBill(@PathVariable Long id) {
        saleService.deleteHeldBill(id);
        return ResponseEntity.noContent().build();
    }
}
