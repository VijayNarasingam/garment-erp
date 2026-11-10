package com.garmentshop.erp.inventory;

import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.BranchStock;
import com.garmentshop.erp.domain.CostingMethod;
import com.garmentshop.erp.domain.FifoLayer;
import com.garmentshop.erp.domain.ProductVariant;
import com.garmentshop.erp.domain.StockMovement;
import com.garmentshop.erp.domain.StockMovementType;
import com.garmentshop.erp.repository.BranchStockRepository;
import com.garmentshop.erp.repository.FifoLayerRepository;
import com.garmentshop.erp.repository.ProductVariantRepository;
import com.garmentshop.erp.repository.StockMovementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Central stock ledger. Every quantity change must go through this service so
 * that the on-hand balance, costing layers and immutable movement history stay
 * consistent. Callers post the corresponding accounting entry.
 */
@Service
@RequiredArgsConstructor
public class StockLedger {

    private static final int COST_SCALE = 4;

    private final BranchStockRepository stockRepository;
    private final FifoLayerRepository fifoLayerRepository;
    private final StockMovementRepository movementRepository;
    private final ProductVariantRepository variantRepository;

    @Transactional
    public StockResult receive(Branch branch, ProductVariant variant, int quantity, BigDecimal unitCost,
                               CostingMethod method, StockMovementType type, LocalDate date, String reason,
                               String referenceType, String referenceId, Long userId, String username,
                               String deviceId) {
        if (quantity <= 0) {
            throw ApiException.badRequest("INVALID_QUANTITY", "Received quantity must be greater than zero.");
        }
        BigDecimal cost = unitCost == null ? Money.nz(variant.getPurchasePrice()) : unitCost;
        if (cost.signum() < 0) {
            throw ApiException.badRequest("INVALID_COST", "Unit cost cannot be negative.");
        }
        BranchStock stock = lockOrCreate(branch, variant);
        int previous = stock.getQuantity();
        BigDecimal previousValue = average(stock).multiply(BigDecimal.valueOf(Math.max(previous, 0)));
        BigDecimal incomingValue = cost.multiply(BigDecimal.valueOf(quantity));
        int newQuantity = previous + quantity;
        BigDecimal newAverage;
        if (previous <= 0) {
            newAverage = cost.setScale(COST_SCALE, RoundingMode.HALF_UP);
        } else {
            newAverage = previousValue.add(incomingValue)
                    .divide(BigDecimal.valueOf(newQuantity), COST_SCALE, RoundingMode.HALF_UP);
        }
        stock.setQuantity(newQuantity);
        stock.setAverageCost(newAverage);
        stock.setLastMovementAt(Instant.now());
        stockRepository.save(stock);

        FifoLayer layer = new FifoLayer();
        layer.setBranch(branch);
        layer.setVariant(variant);
        layer.setQuantityReceived(quantity);
        layer.setQuantityRemaining(Math.max(0, Math.min(quantity, newQuantity)));
        layer.setUnitCost(cost.setScale(COST_SCALE, RoundingMode.HALF_UP));
        layer.setReceivedAt(Instant.now());
        layer.setReferenceType(referenceType);
        layer.setReferenceId(referenceId);
        fifoLayerRepository.save(layer);

        StockMovement movement = movement(branch, variant, type, quantity, previous, newQuantity, cost,
                cost.multiply(BigDecimal.valueOf(quantity)), reason, referenceType, referenceId, date,
                userId, username, deviceId);
        movementRepository.save(movement);
        return new StockResult(movement.getId(), previous, newQuantity, cost, movement.getTotalCost(), newAverage);
    }

    @Transactional
    public StockResult issue(Branch branch, ProductVariant variant, int quantity, CostingMethod method,
                             StockMovementType type, LocalDate date, String reason, String referenceType,
                             String referenceId, Long userId, String username, String deviceId,
                             boolean allowNegative) {
        if (quantity <= 0) {
            throw ApiException.badRequest("INVALID_QUANTITY", "Issued quantity must be greater than zero.");
        }
        BranchStock stock = lockOrCreate(branch, variant);
        int previous = stock.getQuantity();
        int newQuantity = previous - quantity;
        if (newQuantity < 0 && !allowNegative) {
            throw ApiException.badRequest("INSUFFICIENT_STOCK",
                    "Insufficient stock for " + variant.getSku() + ". Available " + previous + ".");
        }
        BigDecimal cost = method == CostingMethod.FIFO
                ? consumeFifo(branch, variant, quantity, average(stock))
                : average(stock).setScale(COST_SCALE, RoundingMode.HALF_UP);
        if (cost.signum() < 0) {
            throw ApiException.badRequest("INVALID_COST", "Stock cost cannot be negative.");
        }
        BigDecimal remainingValue = average(stock)
                .multiply(BigDecimal.valueOf(Math.max(previous, 0)))
                .subtract(cost.multiply(BigDecimal.valueOf(Math.min(quantity, Math.max(previous, 0)))));
        stock.setQuantity(newQuantity);
        if (method == CostingMethod.FIFO && newQuantity > 0 && remainingValue.signum() >= 0) {
            stock.setAverageCost(remainingValue.divide(BigDecimal.valueOf(newQuantity), COST_SCALE, RoundingMode.HALF_UP));
        } else if (newQuantity <= 0) {
            stock.setAverageCost(cost.setScale(COST_SCALE, RoundingMode.HALF_UP));
        }
        stock.setLastMovementAt(Instant.now());
        stockRepository.save(stock);

        BigDecimal totalCost = Money.of(cost.multiply(BigDecimal.valueOf(quantity)));
        StockMovement movement = movement(branch, variant, type, -quantity, previous, newQuantity, cost,
                totalCost, reason, referenceType, referenceId, date, userId, username, deviceId);
        movementRepository.save(movement);
        return new StockResult(movement.getId(), previous, newQuantity, cost, totalCost, stock.getAverageCost());
    }

    /**
     * Reverses an issue by receiving stock back at the exact original cost.
     */
    @Transactional
    public StockResult returnStock(Branch branch, ProductVariant variant, int quantity, BigDecimal originalCost,
                                   StockMovementType type, LocalDate date, String reason, String referenceType,
                                   String referenceId, Long userId, String username, String deviceId,
                                   CostingMethod method) {
        return receive(branch, variant, quantity, originalCost, method, type, date, reason, referenceType,
                referenceId, userId, username, deviceId);
    }

    @Transactional(readOnly = true)
    public int quantity(Long branchId, Long variantId) {
        return stockRepository.findByBranchIdAndVariantId(branchId, variantId)
                .map(BranchStock::getQuantity).orElse(0);
    }

    @Transactional(readOnly = true)
    public BranchStock stock(Long branchId, Long variantId) {
        return stockRepository.findByBranchIdAndVariantId(branchId, variantId).orElse(null);
    }

    private BranchStock lockOrCreate(Branch branch, ProductVariant variant) {
        return stockRepository.findForUpdate(branch.getId(), variant.getId()).orElseGet(() -> {
            BranchStock created = new BranchStock();
            created.setBranch(branch);
            created.setVariant(variant);
            created.setQuantity(0);
            created.setAverageCost(BigDecimal.ZERO.setScale(COST_SCALE, RoundingMode.HALF_UP));
            return stockRepository.save(created);
        });
    }

    private BigDecimal consumeFifo(Branch branch, ProductVariant variant, int quantity, BigDecimal fallbackCost) {
        List<FifoLayer> layers = fifoLayerRepository.findOpenLayersForUpdate(branch.getId(), variant.getId());
        int remaining = quantity;
        BigDecimal total = BigDecimal.ZERO;
        for (FifoLayer layer : layers) {
            if (remaining <= 0) {
                break;
            }
            int take = Math.min(remaining, layer.getQuantityRemaining());
            total = total.add(layer.getUnitCost().multiply(BigDecimal.valueOf(take)));
            layer.setQuantityRemaining(layer.getQuantityRemaining() - take);
            fifoLayerRepository.save(layer);
            remaining -= take;
        }
        if (remaining > 0) {
            total = total.add(fallbackCost.multiply(BigDecimal.valueOf(remaining)));
        }
        return total.divide(BigDecimal.valueOf(quantity), COST_SCALE, RoundingMode.HALF_UP);
    }

    private StockMovement movement(Branch branch, ProductVariant variant, StockMovementType type, int signedQuantity,
                                   int previous, int next, BigDecimal unitCost, BigDecimal totalCost, String reason,
                                   String referenceType, String referenceId, LocalDate date, Long userId,
                                   String username, String deviceId) {
        StockMovement movement = new StockMovement();
        movement.setBusinessId(branch.getBusiness().getId());
        movement.setBranch(branch);
        movement.setVariant(variant);
        movement.setType(type);
        movement.setQuantity(signedQuantity);
        movement.setPreviousQuantity(previous);
        movement.setNewQuantity(next);
        movement.setUnitCost(unitCost.setScale(COST_SCALE, RoundingMode.HALF_UP));
        movement.setTotalCost(Money.of(totalCost));
        movement.setReason(reason == null || reason.isBlank() ? type.name() : reason);
        movement.setReferenceType(referenceType);
        movement.setReferenceId(referenceId);
        movement.setUserId(userId);
        movement.setUsername(username);
        movement.setDeviceId(deviceId);
        movement.setMovementDate(date == null ? LocalDate.now() : date);
        return movement;
    }

    private BigDecimal average(BranchStock stock) {
        return stock.getAverageCost() == null ? BigDecimal.ZERO : stock.getAverageCost();
    }

    public record StockResult(Long movementId, int previousQuantity, int newQuantity, BigDecimal unitCost,
                              BigDecimal totalCost, BigDecimal newAverageCost) {
    }
}
