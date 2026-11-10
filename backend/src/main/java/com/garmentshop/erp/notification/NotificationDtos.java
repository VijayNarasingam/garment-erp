package com.garmentshop.erp.notification;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.Map;

public final class NotificationDtos {

    private NotificationDtos() {
    }

    public record TemplateRequest(
            @NotBlank String event,
            @NotBlank String channel,
            @NotBlank @Size(max = 200) String subject,
            @NotBlank String body,
            Boolean active
    ) {
    }

    public record TemplateResponse(Long id, String event, String channel, String subject, String body,
                                   boolean active) {
    }

    public record ConsentRequest(
            @NotNull Long customerId,
            @NotBlank String channel,
            boolean optedIn,
            @Size(max = 300) String notes
    ) {
    }

    public record ConsentResponse(Long id, Long customerId, String channel, boolean optedIn,
                                  Instant consentedAt, String notes) {
    }

    public record EnqueueRequest(
            @NotBlank String event,
            @NotBlank String channel,
            Long customerId,
            @Size(max = 200) String recipient,
            @Size(max = 200) String subject,
            Map<String, String> variables,
            @Size(max = 40) String referenceType,
            @Size(max = 80) String referenceId
    ) {
    }

    public record LogResponse(Long id, Long customerId, String channel, String event, String recipient,
                              String subject, String message, String status, String provider,
                              String providerMessageId, String errorMessage, int attempts, Instant sentAt,
                              String referenceType, String referenceId, Instant createdAt) {
    }
}
