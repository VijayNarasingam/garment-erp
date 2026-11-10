package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "devices", uniqueConstraints = @UniqueConstraint(name = "uk_device_id", columnNames = {"device_id"}))
@Getter
@Setter
@NoArgsConstructor
public class DeviceRegistration extends BaseEntity {

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @Column(name = "device_id", nullable = false, length = 80)
    private String deviceId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 30)
    private String appVersion;

    private Instant lastSyncAt;

    private Instant lastSeenAt;

    @Column(nullable = false)
    private boolean active = true;
}
