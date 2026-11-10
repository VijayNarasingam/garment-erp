package com.garmentshop.erp.inventory;

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
@RequestMapping("/api/inventory")
@RequiredArgsConstructor
public class InventoryController {

    private final InventoryService inventoryService;

    @GetMapping("/stock")
    @PreAuthorize("hasAuthority('inventory.view') or hasAuthority('pos.bill')")
    public List<InventoryDtos.StockRow> stock(@RequestParam Long branchId) {
        return inventoryService.stock(branchId);
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAuthority('inventory.view') or hasAuthority('pos.bill')")
    public InventoryDtos.StockSummary summary(@RequestParam Long branchId) {
        return inventoryService.summary(branchId);
    }

    @GetMapping("/low-stock")
    @PreAuthorize("hasAuthority('inventory.view')")
    public List<InventoryDtos.StockRow> lowStock(@RequestParam Long branchId) {
        return inventoryService.lowStock(branchId);
    }

    @GetMapping("/movements")
    @PreAuthorize("hasAuthority('inventory.view')")
    public PageResponse<InventoryDtos.MovementResponse> movements(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long variantId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return inventoryService.movements(branchId, variantId, from, to, page, size);
    }

    @GetMapping("/valuation")
    @PreAuthorize("hasAuthority('inventory.view') or hasAuthority('accounting.view')")
    public InventoryDtos.ValuationResponse valuation(@RequestParam(required = false) Long branchId) {
        return inventoryService.valuation(branchId);
    }

    @GetMapping("/lookup")
    @PreAuthorize("hasAuthority('pos.bill') or hasAuthority('inventory.view')")
    public InventoryDtos.VariantStock lookup(@RequestParam Long branchId, @RequestParam String term) {
        return inventoryService.lookupVariant(branchId, term);
    }

    @PostMapping("/adjustments")
    @PreAuthorize("hasAuthority('inventory.adjust')")
    public InventoryDtos.AdjustmentResponse adjust(@Valid @RequestBody InventoryDtos.AdjustStockRequest request) {
        return inventoryService.adjust(request);
    }

    @GetMapping("/transfers")
    @PreAuthorize("hasAuthority('inventory.view') or hasAuthority('inventory.transfer')")
    public List<InventoryDtos.TransferResponse> transfers() {
        return inventoryService.transfers();
    }

    @GetMapping("/transfers/{id}")
    @PreAuthorize("hasAuthority('inventory.view') or hasAuthority('inventory.transfer')")
    public InventoryDtos.TransferResponse transfer(@PathVariable Long id) {
        return inventoryService.transfer(id);
    }

    @PostMapping("/transfers")
    @PreAuthorize("hasAuthority('inventory.transfer')")
    public InventoryDtos.TransferResponse createTransfer(
            @Valid @RequestBody InventoryDtos.CreateTransferRequest request) {
        return inventoryService.createTransfer(request);
    }

    @PostMapping("/transfers/{id}/complete")
    @PreAuthorize("hasAuthority('inventory.transfer')")
    public InventoryDtos.TransferResponse completeTransfer(@PathVariable Long id) {
        return inventoryService.completeTransfer(id);
    }

    @PostMapping("/transfers/{id}/cancel")
    @PreAuthorize("hasAuthority('inventory.transfer')")
    public InventoryDtos.TransferResponse cancelTransfer(@PathVariable Long id) {
        return inventoryService.cancelTransfer(id);
    }

    @GetMapping("/costing")
    @PreAuthorize("hasAuthority('inventory.costing') or hasAuthority('inventory.view')")
    public List<InventoryDtos.CostingConfigResponse> costingHistory() {
        return inventoryService.costingHistory();
    }

    @PostMapping("/costing")
    @PreAuthorize("hasAuthority('inventory.costing')")
    public InventoryDtos.RevaluationResponse changeCosting(
            @Valid @RequestBody InventoryDtos.CostingChangeRequest request) {
        return inventoryService.changeCostingMethod(request);
    }
}
