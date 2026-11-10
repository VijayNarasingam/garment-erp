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

@Entity
@Table(name = "invoice_sequences",
        uniqueConstraints = @UniqueConstraint(name = "uk_sequence_branch_fy", columnNames = {"branch_id", "financial_year"}))
@Getter
@Setter
@NoArgsConstructor
public class InvoiceSequence extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @Column(name = "financial_year", nullable = false, length = 12)
    private String financialYear;

    @Column(nullable = false, length = 20)
    private String prefix;

    @Column(nullable = false)
    private long nextNumber = 1;
}
