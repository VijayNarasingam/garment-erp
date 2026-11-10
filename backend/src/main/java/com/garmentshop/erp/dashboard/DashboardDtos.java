package com.garmentshop.erp.dashboard;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class DashboardDtos {

    private DashboardDtos() {
    }

    public record TrendPoint(LocalDate date, BigDecimal sales, long invoices) {
    }

    public record TopProduct(Long variantId, String productName, String sku, String size, String color,
                             long quantity, BigDecimal sales) {
    }

    public record BranchPerformance(Long branchId, String branchName, BigDecimal sales, long invoices) {
    }

    public record LowStockItem(Long branchId, String branchName, Long variantId, String productName, String sku,
                               String size, String color, int quantity, int reorderLevel) {
    }

    public record RecentInvoice(Long id, String invoiceNo, LocalDate invoiceDate, String customerName,
                                BigDecimal total, String status) {
    }

    public record DashboardResponse(LocalDate date, BigDecimal todaySales, long todayInvoices,
                                    BigDecimal monthSales, long monthInvoices, BigDecimal averageBill,
                                    BigDecimal outstandingReceivables, BigDecimal cashInHand,
                                    BigDecimal inventoryValue, long lowStockCount, long pendingReturns,
                                    long pendingExpenses, List<TrendPoint> salesTrend,
                                    List<TopProduct> topProducts, List<BranchPerformance> branchPerformance,
                                    List<LowStockItem> lowStockItems, List<RecentInvoice> recentInvoices) {
    }
}
