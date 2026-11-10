package com.garmentshop.erp.notification;

import com.garmentshop.erp.common.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/templates")
    @PreAuthorize("hasAuthority('notification.view') or hasAuthority('notification.manage')")
    public List<NotificationDtos.TemplateResponse> templates() {
        return notificationService.templates();
    }

    @PutMapping("/templates")
    @PreAuthorize("hasAuthority('notification.manage')")
    public NotificationDtos.TemplateResponse saveTemplate(
            @Valid @RequestBody NotificationDtos.TemplateRequest request) {
        return notificationService.saveTemplate(request);
    }

    @GetMapping("/consents")
    @PreAuthorize("hasAuthority('notification.view') or hasAuthority('notification.manage')")
    public List<NotificationDtos.ConsentResponse> consents(@RequestParam Long customerId) {
        return notificationService.consents(customerId);
    }

    @PutMapping("/consents")
    @PreAuthorize("hasAuthority('notification.manage')")
    public NotificationDtos.ConsentResponse saveConsent(
            @Valid @RequestBody NotificationDtos.ConsentRequest request) {
        return notificationService.saveConsent(request);
    }

    @GetMapping("/logs")
    @PreAuthorize("hasAuthority('notification.view') or hasAuthority('notification.manage')")
    public PageResponse<NotificationDtos.LogResponse> logs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return notificationService.logs(page, size);
    }

    @PostMapping("/enqueue")
    @PreAuthorize("hasAuthority('notification.manage')")
    public NotificationDtos.LogResponse enqueue(@Valid @RequestBody NotificationDtos.EnqueueRequest request) {
        return notificationService.enqueue(request);
    }

    @PostMapping("/logs/{id}/retry")
    @PreAuthorize("hasAuthority('notification.manage')")
    public NotificationDtos.LogResponse retry(@PathVariable Long id) {
        return notificationService.retry(id);
    }
}
