package com.garmentshop.erp.dashboard;

import com.garmentshop.erp.accounting.AccountingService;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.domain.Account;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.BranchStock;
import com.garmentshop.erp.domain.ExpenseStatus;
import com.garmentshop.erp.domain.Invoice;
import com.garmentshop.erp.domain.InvoiceStatus;
import com.garmentshop.erp.domain.ReturnStatus;
import com.garmentshop.erp.repository.AccountRepository;
import com.garmentshop.erp.repository.BranchRepository;
import com.garmentshop.erp.repository.BranchStockRepository;
import com.garmentshop.erp.repository.ExpenseRepository;
import com.garmentshop.erp.repository.InvoiceItemRepository;
import com.garmentshop.erp.repository.InvoiceRepository;
import com.garmentshop.erp.repository.JournalLineRepository;
import com.garmentshop.erp.repository.SalesReturnRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final InvoiceRepository invoiceRepository;
    private final InvoiceItemRepository invoiceItemRepository;
    private final BranchStockRepository branchStockRepository;
    private final BranchRepository branchRepository;
    private final SalesReturnRepository salesReturnRepository;
    private final ExpenseRepository expenseRepository;
    private final AccountRepository accountRepository;
    private final JournalLineRepository journalLineRepository;
    private final CurrentUserService currentUserService;

    @Transactional(readOnly = true)
    public DashboardDtos.DashboardResponse dashboard(Long branchId) {
        currentUserService.requirePermission(Permissions.DASHBOARD_VIEW);
        if (branchId != null) {
            currentUserService.assertBranch(branchId);
        }
        Long businessId = currentUserService.businessId();
        LocalDate today = LocalDate.now();
        LocalDate monthStart = today.withDayOfMonth(1);
        List<Long> branchIds = branchId == null ? currentUserService.accessibleBranchIds() : List.of(branchId);

        BigDecimal todaySales = invoiceRepository.sumSales(businessId, branchId, today, today);
        long todayInvoices = invoiceRepository.countByBusinessIdAndStatusAndInvoiceDateBetween(
                businessId, InvoiceStatus.POSTED, today, today);
        BigDecimal monthSales = invoiceRepository.sumSales(businessId, branchId, monthStart, today);
        long monthInvoices = invoiceRepository.countByBusinessIdAndStatusAndInvoiceDateBetween(
                businessId, InvoiceStatus.POSTED, monthStart, today);
        BigDecimal averageBill = monthInvoices == 0 ? Money.ZERO
                : Money.of(monthSales.divide(BigDecimal.valueOf(monthInvoices), 2, java.math.RoundingMode.HALF_UP));

        BigDecimal inventoryValue = BigDecimal.ZERO;
        long lowStockCount = 0;
        List<DashboardDtos.LowStockItem> lowStockItems = new ArrayList<>();
        List<DashboardDtos.BranchPerformance> branchPerformance = new ArrayList<>();
        for (Long id : branchIds) {
            Branch branch = branchRepository.findById(id).orElse(null);
            if (branch == null) {
                continue;
            }
            inventoryValue = inventoryValue.add(Money.nz(branchStockRepository.inventoryValue(id)));
            List<BranchStock> low = branchStockRepository.findLowStock(id);
            lowStockCount += low.size();
            for (BranchStock stock : low) {
                if (lowStockItems.size() < 10) {
                    lowStockItems.add(new DashboardDtos.LowStockItem(id, branch.getName(),
                            stock.getVariant().getId(), stock.getVariant().getProduct().getName(),
                            stock.getVariant().getSku(), stock.getVariant().getSize(), stock.getVariant().getColor(),
                            stock.getQuantity(), stock.getVariant().getReorderLevel()));
                }
            }
            BigDecimal branchSales = invoiceRepository.sumSales(businessId, id, monthStart, today);
            long branchInvoices = invoiceRepository.countByBusinessIdAndBranchIdAndStatusAndInvoiceDateBetween(
                    businessId, id, InvoiceStatus.POSTED, monthStart, today);
            branchPerformance.add(new DashboardDtos.BranchPerformance(id, branch.getName(), branchSales, branchInvoices));
        }
        branchPerformance.sort((a, b) -> b.sales().compareTo(a.sales()));

        Map<LocalDate, DashboardDtos.TrendPoint> trend = new LinkedHashMap<>();
        LocalDate trendStart = today.minusDays(13);
        for (LocalDate day = trendStart; !day.isAfter(today); day = day.plusDays(1)) {
            trend.put(day, new DashboardDtos.TrendPoint(day, Money.ZERO, 0));
        }
        for (Object[] row : invoiceRepository.dailySales(businessId, branchId, trendStart, today)) {
            LocalDate date = (LocalDate) row[0];
            trend.put(date, new DashboardDtos.TrendPoint(date, Money.of((BigDecimal) row[1]),
                    ((Number) row[2]).longValue()));
        }

        List<DashboardDtos.TopProduct> topProducts = new ArrayList<>();
        for (Object[] row : invoiceItemRepository.productSales(businessId, branchId, monthStart, today)) {
            if (topProducts.size() >= 5) {
                break;
            }
            topProducts.add(new DashboardDtos.TopProduct(((Number) row[0]).longValue(), (String) row[1],
                    (String) row[2], (String) row[3], (String) row[4], ((Number) row[5]).longValue(),
                    Money.of((BigDecimal) row[6])));
        }

        List<DashboardDtos.RecentInvoice> recent = invoiceRepository
                .findForPeriod(businessId, branchId, today.minusDays(7), today).stream()
                .limit(6)
                .map(i -> new DashboardDtos.RecentInvoice(i.getId(), i.getInvoiceNo(), i.getInvoiceDate(),
                        i.getCustomerName(), i.getTotal(), i.getStatus().name()))
                .toList();

        return new DashboardDtos.DashboardResponse(today, todaySales, todayInvoices, monthSales, monthInvoices,
                averageBill, invoiceRepository.outstandingReceivables(businessId, branchId),
                cashInHand(businessId, branchId, today), Money.of(inventoryValue), lowStockCount,
                salesReturnRepository.countByBusinessIdAndStatus(businessId, ReturnStatus.PENDING),
                expenseRepository.countByBusinessIdAndStatus(businessId, ExpenseStatus.PENDING),
                new ArrayList<>(trend.values()), topProducts, branchPerformance, lowStockItems, recent);
    }

    private BigDecimal cashInHand(Long businessId, Long branchId, LocalDate date) {
        Account cash = accountRepository.findByBusinessIdAndCode(businessId, AccountingService.CASH).orElse(null);
        if (cash == null) {
            return Money.ZERO;
        }
        for (Object[] row : journalLineRepository.trialBalance(businessId, branchId, LocalDate.of(1900, 1, 1), date)) {
            if (((Number) row[0]).longValue() == cash.getId()) {
                return Money.of(((BigDecimal) row[4]).subtract((BigDecimal) row[5]));
            }
        }
        return Money.ZERO;
    }
}
