package com.garmentshop.erp.cash;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class CashDtos {

    private CashDtos() {
    }

    public record OpenSessionRequest(
            @NotNull Long branchId,
            @DecimalMin("0.0") BigDecimal openingBalance,
            @Size(max = 500) String notes
    ) {
    }

    public record CloseSessionRequest(
            @NotNull @DecimalMin("0.0") BigDecimal actualClosing,
            @Size(max = 500) String discrepancyReason,
            @Size(max = 500) String notes
    ) {
    }

    public record ApproveSessionRequest(@Size(max = 500) String notes) {
    }

    public record MovementRequest(
            @NotBlank String type,
            @NotNull @DecimalMin("0.01") BigDecimal amount,
            @Size(max = 100) String reference,
            @Size(max = 300) String notes
    ) {
    }

    public record MovementResponse(Long id, String type, BigDecimal amount, String reference, String notes,
                                   String userName, Instant createdAt) {
    }

    public record SessionResponse(Long id, Long branchId, String branchName, Long cashierId, String cashierName,
                                  BigDecimal openingBalance, Instant openedAt, Instant closedAt,
                                  BigDecimal cashSales, BigDecimal cashRefunds, BigDecimal cashExpenses,
                                  BigDecimal deposits, BigDecimal withdrawals, BigDecimal expectedClosing,
                                  BigDecimal actualClosing, BigDecimal difference, String status, String notes,
                                  String discrepancyReason, String closedByName, Instant approvedAt,
                                  List<MovementResponse> movements) {
    }

    public record DailyClosingResponse(LocalDate date, Long branchId, String branchName, BigDecimal salesTotal,
                                       BigDecimal cashSales, BigDecimal cardSales, BigDecimal upiSales,
                                       BigDecimal bankSales, BigDecimal creditSales, BigDecimal refunds,
                                       BigDecimal expenses, BigDecimal netCash, long invoiceCount) {
    }
}
