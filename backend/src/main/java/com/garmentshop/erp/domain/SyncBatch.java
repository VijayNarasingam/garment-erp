package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "sync_batches",
        uniqueConstraints = @UniqueConstraint(name = "uk_sync_batch_id", columnNames = {"batch_id"}),
        indexes = @Index(name = "idx_sync_device", columnList = "device_id,created_at"))
@Getter
@Setter
@NoArgsConstructor
public class SyncBatch extends BaseEntity {

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_id")
    private DeviceRegistration device;

    @Column(name = "batch_id", nullable = false, length = 80)
    private String batchId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SyncItemStatus status = SyncItemStatus.ACCEPTED;

    @Column(nullable = false)
    private int itemCount;

    @Column(nullable = false)
    private int acceptedCount;

    @Column(nullable = false)
    private int duplicateCount;

    @Column(nullable = false)
    private int conflictCount;

    @Column(nullable = false)
    private int rejectedCount;

    @Column(columnDefinition = "TEXT")
    private String resultsJson;

    @Column(nullable = false, length = 20)
    private String source = "OFFLINE";
}
