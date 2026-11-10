package com.garmentshop.erp.expense;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public final class ExpenseDtos {

    private ExpenseDtos() {
    }

    public record SaveCategoryRequest(
            @NotBlank @Size(max = 120) String name,
            @NotNull Long accountId,
            Boolean active
    ) {
    }

    public record CategoryResponse(Long id, String name, Long accountId, String accountCode, String accountName,
                                   boolean active) {
    }

    public record CreateExpenseRequest(
            @NotNull Long branchId,
            @NotNull Long categoryId,
            LocalDate expenseDate,
            @NotNull @DecimalMin("0.01") BigDecimal amount,
            @NotBlank String paymentMethod,
            @NotBlank @Size(max = 500) String description,
            @Size(max = 500) String attachmentUrl,
            @Size(max = 500) String notes
    ) {
    }

    public record RejectExpenseRequest(@NotBlank @Size(max = 300) String reason) {
    }

    public record ExpenseResponse(Long id, String expenseNo, Long branchId, String branchName, Long categoryId,
                                  String categoryName, LocalDate expenseDate, BigDecimal amount, String paymentMethod,
                                  String description, String attachmentUrl, String status, String requestedByName,
                                  String approvedByName, Instant approvedAt, String rejectionReason,
                                  Long journalEntryId, Long cashSessionId, String notes, Instant createdAt) {
    }
}
