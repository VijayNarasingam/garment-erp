package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "notification_logs", indexes = {
        @Index(name = "idx_notification_status", columnList = "status,next_retry_at"),
        @Index(name = "idx_notification_customer", columnList = "customer_id")
})
@Getter
@Setter
@NoArgsConstructor
public class NotificationLog extends BaseEntity {

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    private Long customerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationChannel channel;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 40)
    private NotificationEvent eventType;

    @Column(nullable = false, length = 200)
    private String recipient;

    @Column(length = 200)
    private String subject;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationStatus status = NotificationStatus.PENDING;

    @Column(length = 100)
    private String providerMessageId;

    @Column(length = 500)
    private String errorMessage;

    @Column(nullable = false)
    private int attempts = 0;

    private Instant nextRetryAt;

    private Instant sentAt;

    @Column(length = 40)
    private String referenceType;

    @Column(length = 80)
    private String referenceId;

    @Column(nullable = false, length = 30)
    private String provider = "disabled";
}
