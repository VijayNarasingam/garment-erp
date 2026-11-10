package com.garmentshop.erp.party;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class PartyDtos {

    private PartyDtos() {
    }

    public record CustomerResponse(Long id, String code, String name, String phone, String email, String gstin,
                                   String address, String city, String state, String stateCode,
                                   BigDecimal creditLimit, BigDecimal discountPercent, BigDecimal openingBalance,
                                   String notes, boolean active, BigDecimal outstandingBalance) {
    }

    public record SaveCustomerRequest(
            @Size(max = 30) String code,
            @NotBlank @Size(max = 150) String name,
            @Size(max = 30) String phone,
            @Email @Size(max = 150) String email,
            @Size(max = 20) String gstin,
            @Size(max = 300) String address,
            @Size(max = 80) String city,
            @Size(max = 80) String state,
            @Size(max = 10) String stateCode,
            @NotNull @DecimalMin("0.0") BigDecimal creditLimit,
            @NotNull @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal discountPercent,
            @DecimalMin("0.0") BigDecimal openingBalance,
            @Size(max = 500) String notes,
            boolean active
    ) {
    }

    public record SupplierResponse(Long id, String code, String name, String contactPerson, String phone,
                                   String email, String gstin, String address, String city, String state,
                                   String stateCode, int paymentTermsDays, BigDecimal openingBalance,
                                   String notes, boolean active, BigDecimal outstandingPayable) {
    }

    public record SaveSupplierRequest(
            @Size(max = 30) String code,
            @NotBlank @Size(max = 150) String name,
            @Size(max = 120) String contactPerson,
            @Size(max = 30) String phone,
            @Email @Size(max = 150) String email,
            @Size(max = 20) String gstin,
            @Size(max = 300) String address,
            @Size(max = 80) String city,
            @Size(max = 80) String state,
            @Size(max = 10) String stateCode,
            int paymentTermsDays,
            @DecimalMin("0.0") BigDecimal openingBalance,
            @Size(max = 500) String notes,
            boolean active
    ) {
    }

    public record LedgerEntry(LocalDate date, String type, String reference, String description,
                              BigDecimal debit, BigDecimal credit, BigDecimal balance) {
    }

    public record CustomerLedger(Long customerId, String customerName, BigDecimal openingBalance,
                                 BigDecimal totalDebit, BigDecimal totalCredit, BigDecimal closingBalance,
                                 List<LedgerEntry> entries) {
    }

    public record SupplierLedger(Long supplierId, String supplierName, BigDecimal openingBalance,
                                 BigDecimal totalDebit, BigDecimal totalCredit, BigDecimal closingPayable,
                                 List<LedgerEntry> entries) {
    }
}
