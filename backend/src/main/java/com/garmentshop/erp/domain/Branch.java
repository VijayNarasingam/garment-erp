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
@Table(name = "branches", uniqueConstraints = @UniqueConstraint(name = "uk_branch_business_code", columnNames = {"business_id", "code"}))
@Getter
@Setter
@NoArgsConstructor
public class Branch extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 300)
    private String address;

    @Column(length = 80)
    private String city;

    @Column(length = 80)
    private String state;

    @Column(length = 10)
    private String stateCode;

    @Column(length = 30)
    private String phone;

    @Column(length = 150)
    private String email;

    @Column(length = 20)
    private String gstin;

    @Column(nullable = false, length = 20)
    private String invoicePrefix = "INV";

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean primaryBranch = false;

    public boolean isActive() {
        return active;
    }
}
