package com.garmentshop.erp.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.PageResponse;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.BranchStock;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.Customer;
import com.garmentshop.erp.domain.DeviceRegistration;
import com.garmentshop.erp.domain.Invoice;
import com.garmentshop.erp.domain.ProductVariant;
import com.garmentshop.erp.domain.SyncBatch;
import com.garmentshop.erp.domain.SyncItemStatus;
import com.garmentshop.erp.domain.TaxCategory;
import com.garmentshop.erp.repository.BranchRepository;
import com.garmentshop.erp.repository.BranchStockRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.CustomerRepository;
import com.garmentshop.erp.repository.DeviceRegistrationRepository;
import com.garmentshop.erp.repository.InvoiceRepository;
import com.garmentshop.erp.repository.ProductVariantRepository;
import com.garmentshop.erp.repository.SyncBatchRepository;
import com.garmentshop.erp.repository.TaxCategoryRepository;
import com.garmentshop.erp.sales.SaleDtos;
import com.garmentshop.erp.sales.SaleService;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class SyncService {

    private final DeviceRegistrationRepository deviceRepository;
    private final SyncBatchRepository syncBatchRepository;
    private final BranchStockRepository stockRepository;
    private final ProductVariantRepository variantRepository;
    private final CustomerRepository customerRepository;
    private final TaxCategoryRepository taxCategoryRepository;
    private final BusinessRepository businessRepository;
    private final BranchRepository branchRepository;
    private final InvoiceRepository invoiceRepository;
    private final SaleService saleService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    // ---------- Devices ----------

    @Transactional
    public SyncDtos.DeviceResponse registerDevice(SyncDtos.RegisterDeviceRequest request) {
        currentUserService.requirePermission(Permissions.SYNC_USE);
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(request.branchId());

        DeviceRegistration device = deviceRepository.findByDeviceId(request.deviceId()).orElse(null);
        if (device != null && !Objects.equals(device.getBusinessId(), businessId)) {
            throw ApiException.conflict("DEVICE_ID_CONFLICT", "This device ID is already registered to another business.");
        }
        Instant now = Instant.now();
        if (device == null) {
            device = new DeviceRegistration();
            device.setBusinessId(businessId);
            device.setDeviceId(request.deviceId());
        }
        device.setBranch(branch);
        device.setName(request.name());
        device.setAppVersion(request.appVersion());
        device.setActive(true);
        device.setLastSeenAt(now);
        deviceRepository.save(device);
        auditService.log("DEVICE_REGISTERED", "DEVICE", device.getDeviceId(), null,
                Map.of("branchId", branch.getId(), "name", request.name()), null, branch.getId(),
                device.getDeviceId());
        return deviceResponse(device);
    }

    @Transactional(readOnly = true)
    public List<SyncDtos.DeviceResponse> devices(Long branchId) {
        currentUserService.requirePermission(Permissions.SYNC_MANAGE);
        Long businessId = currentUserService.businessId();
        List<DeviceRegistration> devices;
        if (branchId == null) {
            devices = deviceRepository.findByBusinessIdOrderByLastSeenAtDesc(businessId);
        } else {
            currentUserService.assertBranch(branchId);
            devices = deviceRepository.findByBusinessIdAndBranchIdOrderByLastSeenAtDesc(businessId, branchId);
        }
        return devices.stream().map(this::deviceResponse).toList();
    }

    @Transactional
    public SyncDtos.DeviceResponse setDeviceActive(String deviceId, boolean active) {
        currentUserService.requirePermission(Permissions.SYNC_MANAGE);
        DeviceRegistration device = deviceRepository.findByDeviceIdAndBusinessId(deviceId, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Device not found."));
        device.setActive(active);
        device.setLastSeenAt(Instant.now());
        deviceRepository.save(device);
        auditService.log(active ? "DEVICE_ACTIVATED" : "DEVICE_DEACTIVATED", "DEVICE", deviceId,
                Map.of("active", !active), Map.of("active", active), null,
                device.getBranch().getId(), deviceId);
        return deviceResponse(device);
    }

    // ---------- Offline invoice batches ----------

    @Transactional
    public SyncDtos.SyncBatchResponse syncBatch(SyncDtos.SyncBatchRequest request) {
        currentUserService.requirePermission(Permissions.SYNC_USE);
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(request.branchId());

        SyncBatch existing = syncBatchRepository.findByBatchIdWithBranch(request.batchId()).orElse(null);
        if (existing != null) {
            if (!Objects.equals(existing.getBusinessId(), businessId)) {
                throw ApiException.conflict("SYNC_BATCH_CONFLICT", "This batch ID belongs to another business.");
            }
            return readResults(existing);
        }

        DeviceRegistration device = deviceRepository.findByDeviceIdAndBusinessId(request.deviceId(), businessId)
                .orElseThrow(() -> ApiException.badRequest("DEVICE_NOT_REGISTERED",
                        "Register this device before sending offline invoices."));
        if (!device.isActive()) {
            throw ApiException.forbidden("DEVICE_DISABLED", "This device has been disabled. Contact an administrator.");
        }
        if (!Objects.equals(device.getBranch().getId(), branch.getId())) {
            throw ApiException.badRequest("DEVICE_BRANCH_MISMATCH",
                    "The device is registered to a different branch.");
        }

        List<SyncDtos.SyncItemResult> results = new ArrayList<>();
        int accepted = 0;
        int duplicates = 0;
        int conflicts = 0;
        int rejected = 0;
        for (SyncDtos.SyncInvoiceItem item : request.invoices()) {
            SyncDtos.SyncItemResult result = processItem(businessId, branch.getId(), item);
            results.add(result);
            switch (result.status()) {
                case "ACCEPTED" -> accepted++;
                case "DUPLICATE" -> duplicates++;
                case "CONFLICT" -> conflicts++;
                default -> rejected++;
            }
        }

        SyncItemStatus status;
        if (conflicts > 0 || rejected > 0) {
            status = accepted + duplicates > 0 ? SyncItemStatus.CONFLICT : SyncItemStatus.REJECTED;
        } else {
            status = SyncItemStatus.ACCEPTED;
        }

        Instant processedAt = Instant.now();
        SyncDtos.SyncBatchResponse response = new SyncDtos.SyncBatchResponse(
                request.batchId(), status.name(), results.size(), accepted, duplicates, conflicts, rejected,
                processedAt, List.copyOf(results));

        SyncBatch batch = new SyncBatch();
        batch.setBusinessId(businessId);
        batch.setBranch(branchRepository.getReferenceById(branch.getId()));
        batch.setDevice(device);
        batch.setBatchId(request.batchId());
        batch.setStatus(status);
        batch.setItemCount(results.size());
        batch.setAcceptedCount(accepted);
        batch.setDuplicateCount(duplicates);
        batch.setConflictCount(conflicts);
        batch.setRejectedCount(rejected);
        batch.setSource("OFFLINE");
        try {
            batch.setResultsJson(objectMapper.writeValueAsString(response));
        } catch (Exception ex) {
            log.error("Could not serialize sync batch results for {}", request.batchId(), ex);
            batch.setResultsJson(null);
        }
        syncBatchRepository.save(batch);

        device.setLastSyncAt(processedAt);
        device.setLastSeenAt(processedAt);
        deviceRepository.save(device);

        auditService.log("SYNC_BATCH_PROCESSED", "SYNC_BATCH", request.batchId(), null,
                Map.of("status", status.name(), "accepted", accepted, "duplicates", duplicates,
                        "conflicts", conflicts, "rejected", rejected),
                null, branch.getId(), request.deviceId());
        return response;
    }

    @Transactional(readOnly = true)
    public PageResponse<SyncDtos.SyncBatchSummary> batches(Long branchId, int page, int size) {
        currentUserService.requirePermission(Permissions.SYNC_MANAGE);
        Long businessId = currentUserService.businessId();
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        Page<SyncBatch> result = syncBatchRepository.search(businessId, branchId, pageable);
        return PageResponse.of(result, this::batchSummary);
    }

    @Transactional(readOnly = true)
    public SyncDtos.SyncBatchResponse batch(String batchId) {
        currentUserService.requirePermission(Permissions.SYNC_MANAGE);
        SyncBatch batch = syncBatchRepository.findByBatchIdWithBranch(batchId)
                .orElseThrow(() -> ApiException.notFound("Sync batch not found."));
        if (!Objects.equals(batch.getBusinessId(), currentUserService.businessId())) {
            throw ApiException.notFound("Sync batch not found.");
        }
        return readResults(batch);
    }

    // ---------- Pull snapshot ----------

    @Transactional(readOnly = true)
    public SyncDtos.PullResponse pull(Long branchId, Instant since) {
        currentUserService.requirePermission(Permissions.SYNC_USE);
        Long businessId = currentUserService.businessId();
        Branch branch = currentUserService.branch(branchId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        Instant effectiveSince = since == null ? Instant.EPOCH : since;

        List<ProductVariant> variants = variantRepository.findForSync(businessId, effectiveSince);
        List<BranchStock> stock = stockRepository.findForSync(branchId, effectiveSince);
        List<Customer> customers = customerRepository
                .findByBusiness_IdAndUpdatedAtAfterOrderByNameAsc(businessId, effectiveSince);
        List<TaxCategory> taxCategories = taxCategoryRepository
                .findByBusiness_IdAndUpdatedAtAfterOrderByNameAsc(businessId, effectiveSince);

        boolean defaultTaxInclusive = business.isDefaultTaxInclusive();
        List<SyncDtos.VariantSnapshot> variantDtos = variants.stream()
                .map(v -> variantSnapshot(v, defaultTaxInclusive)).toList();
        List<SyncDtos.StockSnapshotResponse> stockDtos = stock.stream().map(this::stockSnapshot).toList();
        List<SyncDtos.CustomerSnapshot> customerDtos = customers.stream().map(this::customerSnapshot).toList();
        List<SyncDtos.TaxCategorySnapshot> taxDtos = taxCategories.stream()
                .map(t -> taxSnapshot(t, defaultTaxInclusive)).toList();

        return new SyncDtos.PullResponse(Instant.now(), effectiveSince, businessSnapshot(business),
                branchSnapshot(branch), variantDtos, stockDtos, customerDtos, taxDtos);
    }

    // ---------- Item processing ----------

    private SyncDtos.SyncItemResult processItem(Long businessId, Long branchId, SyncDtos.SyncInvoiceItem item) {
        String offlineId = item.offlineId().trim();
        Invoice existing = invoiceRepository.findByOfflineId(offlineId).orElse(null);
        if (existing != null) {
            if (!Objects.equals(existing.getBusinessId(), businessId)) {
                return result(offlineId, "CONFLICT", null, null, "OFFLINE_ID_CONFLICT",
                        "This offline invoice ID is already used by another business.", List.of());
            }
            return result(offlineId, "DUPLICATE", existing.getId(), existing.getInvoiceNo(), "ALREADY_SYNCED",
                    "This offline invoice was already synced.", List.of());
        }

        SaleDtos.CreateSaleRequest invoice = item.invoice();
        if (invoice.branchId() == null || !Objects.equals(invoice.branchId(), branchId)) {
            return result(offlineId, "REJECTED", null, null, "BRANCH_MISMATCH",
                    "Every invoice in a batch must belong to the batch branch.", List.of());
        }

        List<SyncDtos.StockConflict> conflicts = stockConflicts(branchId, invoice, item.lastKnownStock());
        if (!conflicts.isEmpty()) {
            return result(offlineId, "CONFLICT", null, null, "LAST_KNOWN_STOCK_EXCEEDED",
                    "The offline bill exceeds the last known stock. Review the stock snapshot before retrying.",
                    conflicts);
        }

        try {
            SaleDtos.InvoiceResponse created = saleService.create(
                    SaleService.CreateContext.offline(offlineId), invoice);
            return result(offlineId, "ACCEPTED", created.id(), created.invoiceNo(), null,
                    "Invoice accepted and posted.", List.of());
        } catch (ApiException ex) {
            String status = ex.getStatus().value() == 409 ? "CONFLICT" : "REJECTED";
            return result(offlineId, status, null, null, ex.getCode(), ex.getMessage(), List.of());
        } catch (Exception ex) {
            log.error("Offline invoice {} failed to sync", offlineId, ex);
            return result(offlineId, "REJECTED", null, null, "SYNC_ITEM_FAILED",
                    "The invoice could not be posted. No partial records were saved.", List.of());
        }
    }

    private List<SyncDtos.StockConflict> stockConflicts(Long branchId, SaleDtos.CreateSaleRequest invoice,
                                                        List<SyncDtos.StockSnapshot> lastKnownStock) {
        Map<Long, Integer> requested = new LinkedHashMap<>();
        for (SaleDtos.SaleItemRequest line : invoice.items()) {
            requested.merge(line.variantId(), line.quantity(), Integer::sum);
        }
        Map<Long, Integer> lastKnown = new HashMap<>();
        if (lastKnownStock != null) {
            for (SyncDtos.StockSnapshot snapshot : lastKnownStock) {
                lastKnown.put(snapshot.variantId(), snapshot.quantity());
            }
        }
        List<SyncDtos.StockConflict> conflicts = new ArrayList<>();
        for (Map.Entry<Long, Integer> entry : requested.entrySet()) {
            Long variantId = entry.getKey();
            Integer requestedQty = entry.getValue();
            Integer knownQty = lastKnown.get(variantId);
            if (knownQty != null && knownQty >= requestedQty) {
                continue;
            }
            BranchStock current = stockRepository.findByBranchIdAndVariantId(branchId, variantId).orElse(null);
            conflicts.add(new SyncDtos.StockConflict(variantId, knownQty, requestedQty,
                    current == null ? 0 : current.getQuantity()));
        }
        return conflicts;
    }

    // ---------- Mapping ----------

    private SyncDtos.DeviceResponse deviceResponse(DeviceRegistration device) {
        return new SyncDtos.DeviceResponse(device.getId(), device.getDeviceId(), device.getBranch().getId(),
                device.getBranch().getName(), device.getName(), device.getAppVersion(), device.isActive(),
                device.getLastSyncAt(), device.getLastSeenAt(), device.getCreatedAt());
    }

    private SyncDtos.SyncBatchSummary batchSummary(SyncBatch batch) {
        return new SyncDtos.SyncBatchSummary(batch.getId(), batch.getBatchId(), batch.getBranch().getId(),
                batch.getBranch().getName(), batch.getDevice() == null ? null : batch.getDevice().getDeviceId(),
                batch.getStatus().name(), batch.getItemCount(), batch.getAcceptedCount(), batch.getDuplicateCount(),
                batch.getConflictCount(), batch.getRejectedCount(), batch.getCreatedAt());
    }

    private SyncDtos.SyncBatchResponse readResults(SyncBatch batch) {
        if (batch.getResultsJson() != null && !batch.getResultsJson().isBlank()) {
            try {
                return objectMapper.readValue(batch.getResultsJson(), SyncDtos.SyncBatchResponse.class);
            } catch (Exception ex) {
                log.error("Could not read stored sync results for batch {}", batch.getBatchId(), ex);
            }
        }
        return new SyncDtos.SyncBatchResponse(batch.getBatchId(), batch.getStatus().name(), batch.getItemCount(),
                batch.getAcceptedCount(), batch.getDuplicateCount(), batch.getConflictCount(),
                batch.getRejectedCount(), batch.getCreatedAt(), List.of());
    }

    private SyncDtos.BusinessSnapshot businessSnapshot(Business business) {
        return new SyncDtos.BusinessSnapshot(business.getId(), business.getName(), business.getCurrency(),
                business.isGstEnabled(), business.getGstin(), business.getStateCode(),
                business.isDefaultTaxInclusive(), business.isRoundOffEnabled(), business.getInvoicePrefix(),
                business.getFinancialYearStartMonth(), business.getMaxDiscountPercent(),
                business.isAllowNegativeStockWithApproval(), business.getReturnWindowDays(),
                business.getExchangeWindowDays(), business.getTimezone());
    }

    private SyncDtos.BranchSnapshot branchSnapshot(Branch branch) {
        return new SyncDtos.BranchSnapshot(branch.getId(), branch.getCode(), branch.getName(),
                branch.getAddress(), branch.getCity(), branch.getState(), branch.getStateCode(),
                branch.getGstin(), branch.getPhone(), branch.getInvoicePrefix());
    }

    private SyncDtos.VariantSnapshot variantSnapshot(ProductVariant variant, boolean defaultTaxInclusive) {
        TaxCategory tax = variant.getProduct().getTaxCategory();
        BigDecimal taxRate = tax == null ? BigDecimal.ZERO : tax.getGstRate();
        boolean taxInclusive = tax != null && tax.getTaxInclusive() != null
                ? tax.getTaxInclusive() : defaultTaxInclusive;
        return new SyncDtos.VariantSnapshot(variant.getId(), variant.getProduct().getId(),
                variant.getProduct().getCode(), variant.getProduct().getName(),
                variant.getProduct().getCategory() == null ? null : variant.getProduct().getCategory().getName(),
                variant.getProduct().getBrand() == null ? null : variant.getProduct().getBrand().getName(),
                variant.getSku(), variant.getBarcode(), variant.getSize(), variant.getColor(),
                variant.getPurchasePrice(), variant.getSellingPrice(), variant.getMrp(),
                variant.getReorderLevel(), variant.isActive(), variant.getProduct().getHsnCode(),
                tax == null ? null : tax.getId(), taxRate, taxInclusive, variant.getUpdatedAt());
    }

    private SyncDtos.StockSnapshotResponse stockSnapshot(BranchStock stock) {
        return new SyncDtos.StockSnapshotResponse(stock.getVariant().getId(), stock.getVariant().getSku(),
                stock.getQuantity(), stock.getAverageCost(), stock.getLastMovementAt(), stock.getUpdatedAt());
    }

    private SyncDtos.CustomerSnapshot customerSnapshot(Customer customer) {
        return new SyncDtos.CustomerSnapshot(customer.getId(), customer.getCode(), customer.getName(),
                customer.getPhone(), customer.getEmail(), customer.getGstin(), customer.getAddress(),
                customer.getCity(), customer.getState(), customer.getStateCode(), customer.getCreditLimit(),
                customer.getDiscountPercent(), customer.isActive(), customer.getUpdatedAt());
    }

    private SyncDtos.TaxCategorySnapshot taxSnapshot(TaxCategory tax, boolean defaultTaxInclusive) {
        boolean taxInclusive = tax.getTaxInclusive() != null ? tax.getTaxInclusive() : defaultTaxInclusive;
        return new SyncDtos.TaxCategorySnapshot(tax.getId(), tax.getName(), tax.getHsnCode(),
                tax.getGstRate(), tax.getCgstRate(), tax.getSgstRate(), tax.getIgstRate(),
                tax.isExempt(), taxInclusive, tax.isActive(), tax.getUpdatedAt());
    }

    private SyncDtos.SyncItemResult result(String offlineId, String status, Long invoiceId, String invoiceNo,
                                           String code, String message,
                                           List<SyncDtos.StockConflict> conflicts) {
        return new SyncDtos.SyncItemResult(offlineId, status, invoiceId, invoiceNo, code, message, conflicts);
    }
}
