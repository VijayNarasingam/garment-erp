package com.garmentshop.erp.backup;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class BackupDtos {

    private BackupDtos() {
    }

    public record BackupResponse(
            Long id,
            String fileName,
            long sizeBytes,
            String status,
            String type,
            Instant startedAt,
            Instant finishedAt,
            String message,
            Long createdBy,
            String checksum
    ) {
    }

    public record RestoreRequest(
            @NotBlank @Size(max = 300) String confirmation,
            @NotBlank @Size(max = 60) String approverUsername,
            @NotBlank @Size(max = 20) String approverPin,
            @NotBlank @Size(max = 500) String reason
    ) {
    }
}
