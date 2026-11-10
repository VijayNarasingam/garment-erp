package com.garmentshop.erp.domain;

import com.garmentshop.erp.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "document_sequences", uniqueConstraints = @UniqueConstraint(name = "uk_document_sequence", columnNames = {"business_id", "sequence_key"}))
@Getter
@Setter
@NoArgsConstructor
public class DocumentSequence extends BaseEntity {

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "sequence_key", nullable = false, length = 80)
    private String sequenceKey;

    @Column(nullable = false)
    private long nextNumber = 1;
}
