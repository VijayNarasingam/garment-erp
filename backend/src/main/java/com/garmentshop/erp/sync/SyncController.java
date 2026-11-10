package com.garmentshop.erp.sync;

import com.garmentshop.erp.common.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/sync")
@RequiredArgsConstructor
public class SyncController {

    private final SyncService syncService;

    @PostMapping("/devices")
    @PreAuthorize("hasAuthority('sync.use')")
    public SyncDtos.DeviceResponse registerDevice(@Valid @RequestBody SyncDtos.RegisterDeviceRequest request) {
        return syncService.registerDevice(request);
    }

    @GetMapping("/devices")
    @PreAuthorize("hasAuthority('sync.manage')")
    public List<SyncDtos.DeviceResponse> devices(@RequestParam(required = false) Long branchId) {
        return syncService.devices(branchId);
    }

    @PostMapping("/devices/{deviceId}/activate")
    @PreAuthorize("hasAuthority('sync.manage')")
    public SyncDtos.DeviceResponse activate(@PathVariable String deviceId) {
        return syncService.setDeviceActive(deviceId, true);
    }

    @PostMapping("/devices/{deviceId}/deactivate")
    @PreAuthorize("hasAuthority('sync.manage')")
    public SyncDtos.DeviceResponse deactivate(@PathVariable String deviceId) {
        return syncService.setDeviceActive(deviceId, false);
    }

    @PostMapping("/batches")
    @PreAuthorize("hasAuthority('sync.use') and hasAuthority('pos.bill')")
    public SyncDtos.SyncBatchResponse syncBatch(@Valid @RequestBody SyncDtos.SyncBatchRequest request) {
        return syncService.syncBatch(request);
    }

    @GetMapping("/batches")
    @PreAuthorize("hasAuthority('sync.manage')")
    public PageResponse<SyncDtos.SyncBatchSummary> batches(
            @RequestParam(required = false) Long branchId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return syncService.batches(branchId, page, size);
    }

    @GetMapping("/batches/{batchId}")
    @PreAuthorize("hasAuthority('sync.manage')")
    public SyncDtos.SyncBatchResponse batch(@PathVariable String batchId) {
        return syncService.batch(batchId);
    }

    @GetMapping("/pull")
    @PreAuthorize("hasAuthority('sync.use')")
    public SyncDtos.PullResponse pull(
            @RequestParam Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant since) {
        return syncService.pull(branchId, since);
    }
}
