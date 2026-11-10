package com.garmentshop.erp.inventory;

import com.garmentshop.erp.accounting.AccountingService;
import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.common.PageResponse;
import com.garmentshop.erp.common.SequenceService;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.BranchStock;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.CostingConfig;
import com.garmentshop.erp.domain.CostingMethod;
import com.garmentshop.erp.domain.FifoLayer;
import com.garmentshop.erp.domain.JournalEntry;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.NegativeStockApproval;
import com.garmentshop.erp.domain.ProductVariant;
import com.garmentshop.erp.domain.StockMovement;
import com.garmentshop.erp.domain.StockMovementType;
import com.garmentshop.erp.domain.StockTransfer;
import com.garmentshop.erp.domain.StockTransferItem;
import com.garmentshop.erp.domain.TransferStatus;
import com.garmentshop.erp.domain.User;
import com.garmentshop.erp.repository.BranchStockRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.CostingConfigRepository;
import com.garmentshop.erp.repository.FifoLayerRepository;
import com.garmentshop.erp.repository.NegativeStockApprovalRepository;
import com.garmentshop.erp.repository.ProductVariantRepository;
import com.garmentshop.erp.repository.StockMovementRepository;
import com.garmentshop.erp.repository.StockTransferRepository;
import com.garmentshop.erp.security.ApprovalService;
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
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class InventoryService {

    private static final Set<StockMovementType> MANUAL_TYPES = Set.of(
            StockMovementType.ADJUSTMENT, StockMovementType.DAMAGE, StockMovementType.PHYSICAL_COUNT,
            StockMovementType.OPENING);

    private final BranchStockRepository stockRepository;
    private final FifoLayerRepository fifoLayerRepository;
    private final StockMovementRepository movementRepository;
    private final StockTransferRepository transferRepository;
    private final CostingConfigRepository costingConfigRepository;
    private final NegativeStockApprovalRepository negativeApprovalRepository;
    private final ProductVariantRepository variantRepository;
    private final BusinessRepository businessRepository;
    private final StockLedger stockLedger;
    private final AccountingService accountingService;
    private final SequenceService sequenceService;
    private final CurrentUserService currentUserService;
    private final ApprovalService approvalService;
    private final AuditService auditService;

    // ---------- Stock views ----------

    @Transactional(readOnly = true)
    public List<InventoryDtos.StockRow> stock(Long branchId) {
        currentUserService.assertBranch(branchId);
        return stockRepository.findForBranch(branchId).stream().map(this::row).toList();
    }

    @Transactional(readOnly = true)
    public InventoryDtos.StockSummary summary(Long branchId) {
        currentUserService.assertBranch(branchId);
        List<InventoryDtos.StockRow> rows = stockRepository.findForBranch(branchId).stream().map(this::row).toList();
        BigDecimal value = rows.stream().map(InventoryDtos.StockRow::stockValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new InventoryDtos.StockSummary(branchId, rows.stream().mapToLong(InventoryDtos.StockRow::quantity).sum(),
                Money.of(value), rows.stream().filter(InventoryDtos.StockRow::lowStock).count(),
                rows.stream().filter(r -> r.quantity() <= 0).count());
    }

    @Transactional(readOnly = true)
    public PageResponse<InventoryDtos.MovementResponse> movements(Long branchId, Long variantId,
                                                                  LocalDate from, LocalDate to, int page, int size) {
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        Page<StockMovement> result = movementRepository.search(currentUserService.businessId(), branchId, variantId,
                from, to, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                        Sort.by(Sort.Direction.DESC, "id")));
        return PageResponse.of(result, this::movement);
    }

    @Transactional(readOnly = true)
    public List<InventoryDtos.StockRow> lowStock(Long branchId) {
        currentUserService.assertBranch(branchId);
        return stockRepository.findLowStock(branchId).stream().map(this::row).toList();
    }

    @Transactional(readOnly = true)
    public InventoryDtos.ValuationResponse valuation(Long branchId) {
        Long businessId = currentUserService.businessId();
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        List<InventoryDtos.ValuationRow> rows = stockRepository.findAllForBusiness(businessId).stream()
                .filter(s -> branchId == null || s.getBranch().getId().equals(branchId))
                .map(s -> new InventoryDtos.ValuationRow(s.getBranch().getId(), s.getBranch().getName(),
                        s.getVariant().getId(), s.getVariant().getProduct().getName(), s.getVariant().getSku(),
                        s.getQuantity(), s.getAverageCost(),
                        Money.of(s.getAverageCost().multiply(BigDecimal.valueOf(s.getQuantity())))))
                .toList();
        return new InventoryDtos.ValuationResponse(
                Money.of(rows.stream().map(InventoryDtos.ValuationRow::stockValue).reduce(BigDecimal.ZERO, BigDecimal::add)),
                rows.stream().mapToLong(InventoryDtos.ValuationRow::quantity).sum(), rows);
    }

    @Transactional(readOnly = true)
    public InventoryDtos.VariantStock lookupVariant(Long branchId, String term) {
        currentUserService.assertBranch(branchId);
        Long businessId = currentUserService.businessId();
        if (term == null || term.isBlank()) {
            throw ApiException.badRequest("SEARCH_REQUIRED", "Scan or enter a barcode, SKU or product code.");
        }
        ProductVariant variant = variantRepository.findByExactCode(businessId, term.trim()).stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("No active product matches " + term + "."));
        BranchStock stock = stockLedger.stock(branchId, variant.getId());
        BigDecimal taxRate = variant.getProduct().getTaxCategory() == null ? BigDecimal.ZERO
                : variant.getProduct().getTaxCategory().getGstRate();
        boolean inclusive = variant.getProduct().getTaxCategory() != null
                && Boolean.TRUE.equals(variant.getProduct().getTaxCategory().getTaxInclusive());
        return new InventoryDtos.VariantStock(variant.getId(), variant.getProduct().getId(),
                variant.getProduct().getName(), variant.getSku(), variant.getBarcode(), variant.getSize(),
                variant.getColor(), variant.getSellingPrice(), variant.getMrp(), taxRate, inclusive,
                stock == null ? 0 : stock.getQuantity());
    }

    // ---------- Adjustments ----------

    @Transactional
    public InventoryDtos.AdjustmentResponse adjust(InventoryDtos.AdjustStockRequest request) {
        if (request.quantityDelta() == 0) {
            throw ApiException.badRequest("INVALID_QUANTITY", "Adjustment quantity cannot be zero.");
        }
        currentUserService.requirePermission(Permissions.INVENTORY_ADJUST);
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(request.branchId());
        ProductVariant variant = variantRepository.findByIdAndBusinessId(request.variantId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Variant not found."));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        StockMovementType type = request.movementType() == null || request.movementType().isBlank()
                ? StockMovementType.ADJUSTMENT
                : parseManualType(request.movementType());
        UserPrincipal principal = currentUserService.require();
        int currentQuantity = stockLedger.quantity(branch.getId(), variant.getId());
        int newQuantity = currentQuantity + request.quantityDelta();
        boolean negativeShortage = newQuantity < 0;
        User approver = null;
        String approvalNote = null;
        if (negativeShortage) {
            if (!business.isAllowNegativeStockWithApproval()) {
                throw ApiException.badRequest("NEGATIVE_STOCK_DISABLED",
                        "Negative stock is disabled for this business.");
            }
            approver = approvalService.authorize(request.approverUsername(), request.approverPin(),
                    Permissions.NEGATIVE_STOCK_APPROVE, branch.getId(), request.reason());
            approvalNote = "Negative stock approved by " + approver.getUsername();
        }

        StockLedger.StockResult result;
        if (request.quantityDelta() > 0) {
            BigDecimal unitCost = request.unitCost() == null ? variant.getPurchasePrice() : request.unitCost();
            result = stockLedger.receive(branch, variant, request.quantityDelta(), unitCost,
                    business.getCostingMethod(), type, LocalDate.now(), request.reason(), "STOCK_ADJUSTMENT",
                    null, principal.getId(), principal.getFullName(), null);
        } else {
            result = stockLedger.issue(branch, variant, Math.abs(request.quantityDelta()),
                    business.getCostingMethod(), type, LocalDate.now(), request.reason(), "STOCK_ADJUSTMENT",
                    null, principal.getId(), principal.getFullName(), null, negativeShortage);
        }

        if (negativeShortage && approver != null) {
            NegativeStockApproval approval = new NegativeStockApproval();
            approval.setBusinessId(businessId);
            approval.setBranch(branch);
            approval.setVariant(variant);
            approval.setRequestedBy(principal.getId());
            approval.setApprovedBy(approver.getId());
            approval.setApproverUsername(approver.getUsername());
            approval.setReason(request.reason());
            approval.setQuantity(Math.abs(newQuantity));
            approval.setDeviceId("server");
            negativeApprovalRepository.save(approval);
        }

        Long journalId = null;
        if (result.totalCost().signum() > 0) {
            List<AccountingService.Line> lines = request.quantityDelta() > 0
                    ? List.of(AccountingService.debit(AccountingService.INVENTORY, result.totalCost(),
                                    "Stock increase: " + variant.getSku()),
                            AccountingService.credit(AccountingService.INVENTORY_SHRINKAGE, result.totalCost(),
                                    "Stock increase offset: " + variant.getSku()))
                    : List.of(AccountingService.debit(AccountingService.INVENTORY_SHRINKAGE, result.totalCost(),
                                    "Stock decrease: " + variant.getSku()),
                            AccountingService.credit(AccountingService.INVENTORY, result.totalCost(),
                                    "Stock decrease: " + variant.getSku()));
            JournalEntry journal = accountingService.post(businessId, branch, LocalDate.now(),
                    "Stock adjustment (" + type + "): " + variant.getSku() + " — " + request.reason(),
                    JournalSource.STOCK_ADJUSTMENT, String.valueOf(result.movementId()), lines,
                    principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
            journalId = journal.getId();
        }
        auditService.log("STOCK_ADJUSTED", "STOCK_MOVEMENT", result.movementId(),
                Map.of("quantity", currentQuantity), Map.of("quantity", result.newQuantity()),
                request.reason(), branch.getId(), null);
        return new InventoryDtos.AdjustmentResponse(result.movementId(), variant.getId(), result.previousQuantity(),
                result.newQuantity(), result.unitCost(), result.totalCost(), negativeShortage, approvalNote);
    }

    private StockMovementType parseManualType(String raw) {
        try {
            StockMovementType type = StockMovementType.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
            if (!MANUAL_TYPES.contains(type)) {
                throw ApiException.badRequest("INVALID_MOVEMENT_TYPE",
                        "Only adjustment, damage, physical count or opening movements can be entered manually.");
            }
            return type;
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("INVALID_MOVEMENT_TYPE", "Unknown stock movement type.");
        }
    }

    // ---------- Transfers ----------

    @Transactional
    public InventoryDtos.TransferResponse createTransfer(InventoryDtos.CreateTransferRequest request) {
        currentUserService.requirePermission(Permissions.INVENTORY_TRANSFER);
        if (request.fromBranchId().equals(request.toBranchId())) {
            throw ApiException.badRequest("INVALID_TRANSFER", "Source and destination branches must be different.");
        }
        Long businessId = currentUserService.businessId();
        Branch from = currentUserService.branch(request.fromBranchId());
        Branch to = currentUserService.branch(request.toBranchId());
        UserPrincipal principal = currentUserService.require();
        StockTransfer transfer = new StockTransfer();
        transfer.setBusinessId(businessId);
        transfer.setFromBranch(from);
        transfer.setToBranch(to);
        transfer.setTransferDate(request.transferDate() == null ? LocalDate.now() : request.transferDate());
        transfer.setNotes(request.notes());
        transfer.setStatus(TransferStatus.DRAFT);
        transfer.setCreatedBy(principal.getId());
        transfer.setTransferNo(sequenceService.next(businessId, "STOCK_TRANSFER", "TRF",
                FinancialYear.of(transfer.getTransferDate(), from.getBusiness().getFinancialYearStartMonth()).label()));
        Set<Long> seen = new HashSet<>();
        for (InventoryDtos.TransferItemRequest itemRequest : request.items()) {
            if (!seen.add(itemRequest.variantId())) {
                throw ApiException.badRequest("DUPLICATE_VARIANT", "Each variant can appear only once in a transfer.");
            }
            ProductVariant variant = variantRepository.findByIdAndBusinessId(itemRequest.variantId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Variant not found."));
            StockTransferItem item = new StockTransferItem();
            item.setTransfer(transfer);
            item.setVariant(variant);
            item.setQuantity(itemRequest.quantity());
            BranchStock sourceStock = stockLedger.stock(from.getId(), variant.getId());
            item.setUnitCost(sourceStock == null ? variant.getPurchasePrice() : sourceStock.getAverageCost());
            transfer.getItems().add(item);
        }
        transferRepository.save(transfer);
        auditService.log("TRANSFER_CREATED", "STOCK_TRANSFER", transfer.getId(), null,
                Map.of("transferNo", transfer.getTransferNo(), "from", from.getCode(), "to", to.getCode()),
                "Transfer created", from.getId(), null);
        return transferResponse(transfer);
    }

    @Transactional
    public InventoryDtos.TransferResponse completeTransfer(Long id) {
        currentUserService.requirePermission(Permissions.INVENTORY_TRANSFER);
        Long businessId = currentUserService.businessId();
        StockTransfer transfer = transferRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Stock transfer not found."));
        if (transfer.getStatus() != TransferStatus.DRAFT) {
            throw ApiException.badRequest("INVALID_TRANSFER_STATUS", "Only draft transfers can be completed.");
        }
        currentUserService.assertBranch(transfer.getFromBranch().getId());
        currentUserService.assertBranch(transfer.getToBranch().getId());
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        UserPrincipal principal = currentUserService.require();
        for (StockTransferItem item : transfer.getItems()) {
            StockLedger.StockResult issued = stockLedger.issue(transfer.getFromBranch(), item.getVariant(),
                    item.getQuantity(), business.getCostingMethod(), StockMovementType.TRANSFER_OUT,
                    transfer.getTransferDate(), "Transfer " + transfer.getTransferNo(), "STOCK_TRANSFER",
                    String.valueOf(transfer.getId()), principal.getId(), principal.getFullName(), null, false);
            stockLedger.receive(transfer.getToBranch(), item.getVariant(), item.getQuantity(), issued.unitCost(),
                    business.getCostingMethod(), StockMovementType.TRANSFER_IN, transfer.getTransferDate(),
                    "Transfer " + transfer.getTransferNo(), "STOCK_TRANSFER", String.valueOf(transfer.getId()),
                    principal.getId(), principal.getFullName(), null);
            item.setUnitCost(issued.unitCost());
        }
        transfer.setStatus(TransferStatus.COMPLETED);
        transfer.setCompletedBy(principal.getId());
        transfer.setCompletedAt(Instant.now());
        transferRepository.save(transfer);
        auditService.log("TRANSFER_COMPLETED", "STOCK_TRANSFER", transfer.getId(),
                Map.of("status", "DRAFT"), Map.of("status", "COMPLETED"), "Transfer completed",
                transfer.getFromBranch().getId(), null);
        return transferResponse(transfer);
    }

    @Transactional
    public InventoryDtos.TransferResponse cancelTransfer(Long id) {
        currentUserService.requirePermission(Permissions.INVENTORY_TRANSFER);
        StockTransfer transfer = transferRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Stock transfer not found."));
        if (transfer.getStatus() != TransferStatus.DRAFT) {
            throw ApiException.badRequest("INVALID_TRANSFER_STATUS", "Only draft transfers can be cancelled.");
        }
        transfer.setStatus(TransferStatus.CANCELLED);
        transferRepository.save(transfer);
        auditService.log("TRANSFER_CANCELLED", "STOCK_TRANSFER", transfer.getId(),
                Map.of("status", "DRAFT"), Map.of("status", "CANCELLED"), "Transfer cancelled",
                transfer.getFromBranch().getId(), null);
        return transferResponse(transfer);
    }

    @Transactional(readOnly = true)
    public List<InventoryDtos.TransferResponse> transfers() {
        return transferRepository.findByBusinessIdOrderByIdDesc(currentUserService.businessId()).stream()
                .map(this::transferResponse).toList();
    }

    @Transactional(readOnly = true)
    public InventoryDtos.TransferResponse transfer(Long id) {
        return transferResponse(transferRepository.findByIdAndBusinessId(id, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Stock transfer not found.")));
    }

    // ---------- Costing ----------

    @Transactional(readOnly = true)
    public List<InventoryDtos.CostingConfigResponse> costingHistory() {
        return costingConfigRepository.findByBusinessIdOrderByEffectiveFromDescCreatedAtDesc(
                currentUserService.businessId()).stream()
                .map(c -> new InventoryDtos.CostingConfigResponse(c.getId(), c.getMethod().name(),
                        c.getEffectiveFrom(), c.getNote(), c.getRevaluationAmount(), c.getCreatedAt()))
                .toList();
    }

    @Transactional
    public InventoryDtos.RevaluationResponse changeCostingMethod(InventoryDtos.CostingChangeRequest request) {
        currentUserService.requirePermission(Permissions.INVENTORY_COSTING);
        Long businessId = currentUserService.businessId();
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        CostingMethod method;
        try {
            method = CostingMethod.valueOf(request.method().trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("INVALID_COSTING_METHOD", "Supported methods are FIFO and WEIGHTED_AVERAGE.");
        }
        CostingMethod previousMethod = business.getCostingMethod();
        if (previousMethod == method) {
            throw ApiException.badRequest("COSTING_UNCHANGED", "The business already uses " + method + " costing.");
        }
        LocalDate effectiveFrom = request.effectiveFrom();
        if (effectiveFrom.isAfter(LocalDate.now())) {
            throw ApiException.badRequest("FUTURE_COSTING_DATE",
                    "Costing changes cannot be scheduled in the future; revalue stock on the effective date.");
        }
        UserPrincipal principal = currentUserService.require();
        User approver = approvalService.authorize(request.approverUsername(), request.approverPin(),
                Permissions.STOCK_ADJUST_APPROVE, null, "Costing method change: " + request.note());
        List<BranchStock> stocks = stockRepository.findAllForBusiness(businessId);
        BigDecimal previousValue = Money.of(stocks.stream()
                .map(s -> s.getAverageCost().multiply(BigDecimal.valueOf(s.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal newValue = BigDecimal.ZERO;
        for (BranchStock stock : stocks) {
            BigDecimal targetAverage = stock.getAverageCost();
            if (stock.getQuantity() > 0) {
                List<FifoLayer> layers = fifoLayerRepository.findOpenLayersForUpdate(stock.getBranch().getId(),
                        stock.getVariant().getId());
                BigDecimal layerValue = layers.stream()
                        .map(l -> l.getUnitCost().multiply(BigDecimal.valueOf(l.getQuantityRemaining())))
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                int layerQuantity = layers.stream().mapToInt(FifoLayer::getQuantityRemaining).sum();
                if (layerQuantity > 0) {
                    targetAverage = layerValue.divide(BigDecimal.valueOf(layerQuantity), 4, RoundingMode.HALF_UP);
                }
            }
            stock.setAverageCost(targetAverage);
            stockRepository.save(stock);
            newValue = newValue.add(targetAverage.multiply(BigDecimal.valueOf(stock.getQuantity())));
        }
        BigDecimal difference = Money.of(newValue).subtract(Money.of(previousValue));
        Long journalId = null;
        if (difference.signum() != 0) {
            Branch journalBranch = stocks.isEmpty() ? null : stocks.get(0).getBranch();
            if (journalBranch == null) {
                journalBranch = currentUserService.accessibleBranchIds().stream().findFirst()
                        .map(id -> currentUserService.branch(id)).orElse(null);
            }
            if (journalBranch == null) {
                throw ApiException.badRequest("NO_BRANCH", "A branch is required to post the inventory revaluation.");
            }
            List<AccountingService.Line> lines = difference.signum() > 0
                    ? List.of(AccountingService.debit(AccountingService.INVENTORY, difference,
                                    "Inventory revaluation to " + method),
                            AccountingService.credit(AccountingService.OPENING_BALANCE_EQUITY, difference,
                                    "Inventory revaluation to " + method))
                    : List.of(AccountingService.debit(AccountingService.OPENING_BALANCE_EQUITY, difference.abs(),
                                    "Inventory revaluation to " + method),
                            AccountingService.credit(AccountingService.INVENTORY, difference.abs(),
                                    "Inventory revaluation to " + method));
            JournalEntry journal = accountingService.post(businessId, journalBranch, effectiveFrom,
                    "Costing method change " + previousMethod + " to " + method + ": " + request.note(),
                    JournalSource.INVENTORY_REVALUATION, "COSTING:" + method, lines,
                    principal.getId(), principal.getFullName(), business.getFinancialYearStartMonth());
            journalId = journal.getId();
        }
        business.setCostingMethod(method);
        businessRepository.save(business);
        CostingConfig config = new CostingConfig();
        config.setBusiness(business);
        config.setMethod(method);
        config.setEffectiveFrom(effectiveFrom);
        config.setCreatedBy(principal.getId());
        config.setApprovedBy(approver.getId());
        config.setNote(request.note());
        config.setRevaluationAmount(difference);
        costingConfigRepository.save(config);
        auditService.log("COSTING_METHOD_CHANGED", "BUSINESS", businessId,
                Map.of("method", previousMethod.name()),
                Map.of("method", method.name(), "revaluation", difference),
                request.note(), null, null);
        return new InventoryDtos.RevaluationResponse(previousMethod.name(), method.name(),
                Money.of(previousValue), Money.of(newValue), difference, journalId);
    }

    // ---------- Mapping ----------

    private InventoryDtos.StockRow row(BranchStock stock) {
        ProductVariant variant = stock.getVariant();
        BigDecimal value = stock.getAverageCost().multiply(BigDecimal.valueOf(stock.getQuantity()));
        return new InventoryDtos.StockRow(variant.getId(), variant.getProduct().getId(),
                variant.getProduct().getName(), variant.getSku(), variant.getBarcode(), variant.getSize(),
                variant.getColor(), stock.getQuantity(), stock.getAverageCost(), Money.of(value),
                variant.getReorderLevel(), stock.getQuantity() <= variant.getReorderLevel(),
                variant.getSellingPrice(), variant.getMrp());
    }

    private InventoryDtos.MovementResponse movement(StockMovement movement) {
        ProductVariant variant = movement.getVariant();
        return new InventoryDtos.MovementResponse(movement.getId(), movement.getMovementDate(),
                movement.getType().name(), movement.getQuantity(), movement.getPreviousQuantity(),
                movement.getNewQuantity(), movement.getUnitCost(), movement.getTotalCost(), movement.getReason(),
                movement.getReferenceType(), movement.getReferenceId(), movement.getUsername(),
                variant.getId(), variant.getProduct().getName(), variant.getSku(), variant.getSize(),
                variant.getColor(), movement.getBranch().getId(), movement.getBranch().getName());
    }

    private InventoryDtos.TransferResponse transferResponse(StockTransfer transfer) {
        List<InventoryDtos.TransferItemResponse> items = transfer.getItems().stream()
                .sorted(Comparator.comparing(i -> i.getVariant().getSku()))
                .map(i -> new InventoryDtos.TransferItemResponse(i.getVariant().getId(),
                        i.getVariant().getProduct().getName(), i.getVariant().getSku(), i.getQuantity(),
                        i.getUnitCost()))
                .toList();
        return new InventoryDtos.TransferResponse(transfer.getId(), transfer.getTransferNo(),
                transfer.getFromBranch().getId(), transfer.getFromBranch().getName(),
                transfer.getToBranch().getId(), transfer.getToBranch().getName(), transfer.getStatus().name(),
                transfer.getTransferDate(), transfer.getNotes(), items, transfer.getCompletedAt());
    }
}
