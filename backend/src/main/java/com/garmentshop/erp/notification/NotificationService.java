package com.garmentshop.erp.notification;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.PageResponse;
import com.garmentshop.erp.config.AppProperties;
import com.garmentshop.erp.domain.Customer;
import com.garmentshop.erp.domain.NotificationChannel;
import com.garmentshop.erp.domain.NotificationConsent;
import com.garmentshop.erp.domain.NotificationEvent;
import com.garmentshop.erp.domain.NotificationLog;
import com.garmentshop.erp.domain.NotificationStatus;
import com.garmentshop.erp.domain.NotificationTemplate;
import com.garmentshop.erp.repository.CustomerRepository;
import com.garmentshop.erp.repository.NotificationConsentRepository;
import com.garmentshop.erp.repository.NotificationLogRepository;
import com.garmentshop.erp.repository.NotificationTemplateRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.PageRequest;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationTemplateRepository templateRepository;
    private final NotificationConsentRepository consentRepository;
    private final NotificationLogRepository logRepository;
    private final CustomerRepository customerRepository;
    private final AppProperties appProperties;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;
    private final ObjectProvider<JavaMailSender> mailSenderProvider;

    // ---------- Templates ----------

    @Transactional(readOnly = true)
    public List<NotificationDtos.TemplateResponse> templates() {
        return templateRepository.findByBusinessIdOrderByEventTypeAscChannelAsc(currentUserService.businessId())
                .stream().map(this::templateResponse).toList();
    }

    @Transactional
    public NotificationDtos.TemplateResponse saveTemplate(NotificationDtos.TemplateRequest request) {
        currentUserService.requirePermission(Permissions.NOTIFICATION_MANAGE);
        Long businessId = currentUserService.businessId();
        NotificationEvent event = parseEvent(request.event());
        NotificationChannel channel = parseChannel(request.channel());
        NotificationTemplate template = templateRepository
                .findByBusinessIdAndEventTypeAndChannel(businessId, event, channel)
                .orElseGet(NotificationTemplate::new);
        template.setBusinessId(businessId);
        template.setEventType(event);
        template.setChannel(channel);
        template.setSubject(request.subject().trim());
        template.setBody(request.body());
        template.setActive(request.active() == null || request.active());
        templateRepository.save(template);
        auditService.log("NOTIFICATION_TEMPLATE_SAVED", "NOTIFICATION_TEMPLATE", template.getId(), null,
                Map.of("event", event.name(), "channel", channel.name()), "Notification template saved", null, null);
        return templateResponse(template);
    }

    // ---------- Consent ----------

    @Transactional(readOnly = true)
    public List<NotificationDtos.ConsentResponse> consents(Long customerId) {
        customerRepository.findByIdAndBusinessId(customerId, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Customer not found."));
        return consentRepository.findByCustomerId(customerId).stream().map(this::consentResponse).toList();
    }

    @Transactional
    public NotificationDtos.ConsentResponse saveConsent(NotificationDtos.ConsentRequest request) {
        currentUserService.requirePermission(Permissions.NOTIFICATION_MANAGE);
        Long businessId = currentUserService.businessId();
        customerRepository.findByIdAndBusinessId(request.customerId(), businessId)
                .orElseThrow(() -> ApiException.notFound("Customer not found."));
        NotificationChannel channel = parseChannel(request.channel());
        NotificationConsent consent = consentRepository
                .findByCustomerIdAndChannel(request.customerId(), channel)
                .orElseGet(NotificationConsent::new);
        consent.setBusinessId(businessId);
        consent.setCustomerId(request.customerId());
        consent.setChannel(channel);
        consent.setOptedIn(request.optedIn());
        consent.setConsentedAt(request.optedIn() ? Instant.now() : null);
        consent.setNotes(request.notes());
        consentRepository.save(consent);
        return consentResponse(consent);
    }

    // ---------- Logs ----------

    @Transactional(readOnly = true)
    public PageResponse<NotificationDtos.LogResponse> logs(int page, int size) {
        return PageResponse.of(logRepository.findByBusinessIdOrderByIdDesc(currentUserService.businessId(),
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100))), this::logResponse);
    }

    // ---------- Enqueue / send ----------

    @Transactional
    public NotificationDtos.LogResponse enqueue(NotificationDtos.EnqueueRequest request) {
        currentUserService.requirePermission(Permissions.NOTIFICATION_MANAGE);
        Long businessId = currentUserService.businessId();
        NotificationEvent event = parseEvent(request.event());
        NotificationChannel channel = parseChannel(request.channel());
        Customer customer = null;
        if (request.customerId() != null) {
            customer = customerRepository.findByIdAndBusinessId(request.customerId(), businessId)
                    .orElseThrow(() -> ApiException.notFound("Customer not found."));
        }
        NotificationLog log = new NotificationLog();
        log.setBusinessId(businessId);
        log.setCustomerId(request.customerId());
        log.setChannel(channel);
        log.setEventType(event);
        log.setRecipient(resolveRecipient(channel, request.recipient(), customer));
        log.setReferenceType(request.referenceType());
        log.setReferenceId(request.referenceId());
        if (log.getRecipient() == null || log.getRecipient().isBlank()) {
            log.setStatus(NotificationStatus.SKIPPED);
            log.setErrorMessage("No recipient address is available.");
            logRepository.save(log);
            return logResponse(log);
        }
        if (request.customerId() != null) {
            NotificationConsent consent = consentRepository.findByCustomerIdAndChannel(request.customerId(), channel)
                    .orElse(null);
            if (consent == null || !consent.isOptedIn()) {
                log.setStatus(NotificationStatus.SKIPPED);
                log.setErrorMessage("Customer has not opted in to " + channel + " notifications.");
                logRepository.save(log);
                return logResponse(log);
            }
        }
        NotificationTemplate template = templateRepository
                .findByBusinessIdAndEventTypeAndChannel(businessId, event, channel)
                .filter(NotificationTemplate::isActive)
                .orElse(null);
        if (template == null) {
            log.setStatus(NotificationStatus.SKIPPED);
            log.setErrorMessage("No active template is configured for " + event + " / " + channel + ".");
            logRepository.save(log);
            return logResponse(log);
        }
        Map<String, String> variables = request.variables() == null ? Map.of() : request.variables();
        log.setSubject(render(request.subject() == null ? template.getSubject() : request.subject(), variables));
        log.setMessage(render(template.getBody(), variables));
        log.setProvider(providerName(channel));
        logRepository.save(log);
        deliver(log);
        logRepository.save(log);
        return logResponse(log);
    }

    @Transactional
    public NotificationDtos.LogResponse retry(Long id) {
        currentUserService.requirePermission(Permissions.NOTIFICATION_MANAGE);
        NotificationLog log = logRepository.findById(id)
                .filter(l -> l.getBusinessId().equals(currentUserService.businessId()))
                .orElseThrow(() -> ApiException.notFound("Notification not found."));
        if (log.getStatus() == NotificationStatus.SENT) {
            throw ApiException.badRequest("ALREADY_SENT", "This notification was already sent.");
        }
        deliver(log);
        logRepository.save(log);
        return logResponse(log);
    }

    private void deliver(NotificationLog log) {
        AppProperties.Notification.Provider provider = provider(log.getChannel());
        if (provider == null || provider.provider() == null || provider.provider().isBlank()
                || "disabled".equalsIgnoreCase(provider.provider())) {
            log.setStatus(NotificationStatus.SKIPPED);
            log.setErrorMessage("The " + log.getChannel() + " provider is not configured.");
            return;
        }
        log.setAttempts(log.getAttempts() + 1);
        try {
            if (log.getChannel() == NotificationChannel.EMAIL) {
                sendEmail(log);
            } else {
                sendWebhook(log, provider);
            }
            log.setStatus(NotificationStatus.SENT);
            log.setSentAt(Instant.now());
            log.setErrorMessage(null);
            log.setNextRetryAt(null);
        } catch (Exception ex) {
            log.setStatus(NotificationStatus.FAILED);
            log.setErrorMessage(ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage());
            int maxAttempts = appProperties.notification().retry().maxAttempts();
            if (log.getAttempts() < maxAttempts) {
                long delay = Math.max(1, appProperties.notification().retry().initialDelaySeconds())
                        * (long) Math.pow(2, log.getAttempts() - 1);
                log.setNextRetryAt(Instant.now().plusSeconds(delay));
            }
        }
    }

    private void sendWebhook(NotificationLog log, AppProperties.Notification.Provider provider) {
        if (provider.apiUrl() == null || provider.apiUrl().isBlank()) {
            throw new IllegalStateException("Provider API URL is not configured.");
        }
        RestClient client = RestClient.create();
        RestClient.RequestBodySpec spec = client.post().uri(provider.apiUrl())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON);
        if (provider.apiKey() != null && !provider.apiKey().isBlank()) {
            spec = spec.header("Authorization", "Bearer " + provider.apiKey());
        }
        Map<String, String> payload = new java.util.LinkedHashMap<>();
        payload.put("to", log.getRecipient());
        payload.put("sender", provider.sender() == null ? "" : provider.sender());
        payload.put("subject", log.getSubject() == null ? "" : log.getSubject());
        payload.put("message", log.getMessage() == null ? "" : log.getMessage());
        spec.body(payload).retrieve().toBodilessEntity();
    }

    private void sendEmail(NotificationLog log) {
        JavaMailSender sender = mailSenderProvider.getIfAvailable();
        if (sender == null) {
            throw new IllegalStateException("JavaMailSender is not configured. Set spring.mail.* properties.");
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(log.getRecipient());
        message.setSubject(log.getSubject() == null ? log.getEventType().name() : log.getSubject());
        message.setText(log.getMessage() == null ? "" : log.getMessage());
        sender.send(message);
    }

    private String resolveRecipient(NotificationChannel channel, String explicit, Customer customer) {
        if (explicit != null && !explicit.isBlank()) {
            return explicit.trim();
        }
        if (customer == null) {
            return null;
        }
        return switch (channel) {
            case EMAIL -> customer.getEmail();
            case SMS, WHATSAPP -> customer.getPhone();
        };
    }

    private AppProperties.Notification.Provider provider(NotificationChannel channel) {
        if (appProperties.notification() == null) {
            return null;
        }
        return switch (channel) {
            case WHATSAPP -> appProperties.notification().whatsapp();
            case SMS -> appProperties.notification().sms();
            case EMAIL -> appProperties.notification().email();
        };
    }

    private String providerName(NotificationChannel channel) {
        AppProperties.Notification.Provider provider = provider(channel);
        return provider == null || provider.provider() == null || provider.provider().isBlank()
                ? "disabled" : provider.provider();
    }

    private String render(String template, Map<String, String> variables) {
        String rendered = template;
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            rendered = rendered.replace("{{" + entry.getKey() + "}}",
                    entry.getValue() == null ? "" : entry.getValue());
        }
        return rendered;
    }

    private NotificationEvent parseEvent(String raw) {
        try {
            return NotificationEvent.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_NOTIFICATION_EVENT", "Unknown notification event.");
        }
    }

    private NotificationChannel parseChannel(String raw) {
        try {
            return NotificationChannel.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("INVALID_NOTIFICATION_CHANNEL", "Unknown notification channel.");
        }
    }

    private NotificationDtos.TemplateResponse templateResponse(NotificationTemplate template) {
        return new NotificationDtos.TemplateResponse(template.getId(), template.getEventType().name(),
                template.getChannel().name(), template.getSubject(), template.getBody(), template.isActive());
    }

    private NotificationDtos.ConsentResponse consentResponse(NotificationConsent consent) {
        return new NotificationDtos.ConsentResponse(consent.getId(), consent.getCustomerId(),
                consent.getChannel().name(), consent.isOptedIn(), consent.getConsentedAt(), consent.getNotes());
    }

    private NotificationDtos.LogResponse logResponse(NotificationLog log) {
        return new NotificationDtos.LogResponse(log.getId(), log.getCustomerId(), log.getChannel().name(),
                log.getEventType().name(), log.getRecipient(), log.getSubject(), log.getMessage(),
                log.getStatus().name(), log.getProvider(), log.getProviderMessageId(), log.getErrorMessage(),
                log.getAttempts(), log.getSentAt(), log.getReferenceType(), log.getReferenceId(),
                log.getCreatedAt());
    }
}
