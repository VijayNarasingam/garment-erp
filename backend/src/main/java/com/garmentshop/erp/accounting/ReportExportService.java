package com.garmentshop.erp.accounting;

import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.common.Money;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.repository.BranchRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ReportExportService {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy");
    private static final Color HEADER_BG = new Color(238, 232, 220);
    private static final Color LINE = new Color(205, 199, 188);

    private final AccountingReportService accountingReportService;
    private final CurrentUserService currentUserService;
    private final BusinessRepository businessRepository;
    private final BranchRepository branchRepository;

    // ---------- Trial balance ----------

    @Transactional(readOnly = true)
    public byte[] trialBalance(Long branchId, LocalDate from, LocalDate to, String format) {
        requireExport();
        AccountingDtos.TrialBalanceResponse report = accountingReportService.trialBalance(branchId, from, to);
        String[] headers = {"Code", "Account", "Type", "Debit", "Credit", "Balance"};
        List<String[]> rows = report.rows().stream()
                .map(r -> new String[]{r.code(), r.name(), r.type(), money(r.debit()), money(r.credit()),
                        money(r.balance())})
                .toList();
        List<String[]> footer = List.<String[]>of(new String[]{"", "Total", "", money(report.totalDebit()),
                money(report.totalCredit()), report.balanced() ? "Balanced" : "Difference"});
        String subtitle = range(report.from(), report.to());
        return render(format, "Trial Balance", subtitle, headers, rows, footer,
                List.<BigDecimal[]>of(new BigDecimal[]{report.totalDebit(), report.totalCredit()}));
    }

    // ---------- Profit and loss ----------

    @Transactional(readOnly = true)
    public byte[] profitLoss(Long branchId, LocalDate from, LocalDate to, String format) {
        requireExport();
        AccountingDtos.ProfitLossResponse report = accountingReportService.profitLoss(branchId, from, to);
        String[] headers = {"Code", "Account", "Section", "Amount"};
        List<String[]> rows = new ArrayList<>();
        for (AccountingDtos.ProfitLossLine line : report.income()) {
            rows.add(new String[]{line.code(), line.name(), "Income", money(line.amount())});
        }
        rows.add(new String[]{"", "Total income", "", money(report.totalIncome())});
        for (AccountingDtos.ProfitLossLine line : report.expenses()) {
            rows.add(new String[]{line.code(), line.name(), "Expense", money(line.amount())});
        }
        rows.add(new String[]{"", "Total expenses", "", money(report.totalExpenses())});
        rows.add(new String[]{"", "Net profit", "", money(report.netProfit())});
        return render(format, "Profit & Loss", range(report.from(), report.to()), headers, rows,
                List.of(), List.<BigDecimal[]>of(new BigDecimal[]{report.totalIncome(), report.totalExpenses(), report.netProfit()}));
    }

    // ---------- Balance sheet ----------

    @Transactional(readOnly = true)
    public byte[] balanceSheet(Long branchId, LocalDate asOf, String format) {
        requireExport();
        AccountingDtos.BalanceSheetResponse report = accountingReportService.balanceSheet(branchId, asOf);
        String[] headers = {"Code", "Account", "Section", "Amount"};
        List<String[]> rows = new ArrayList<>();
        report.assets().forEach(l -> rows.add(new String[]{l.code(), l.name(), "Asset", money(l.amount())}));
        rows.add(new String[]{"", "Total assets", "", money(report.totalAssets())});
        report.liabilities().forEach(l -> rows.add(new String[]{l.code(), l.name(), "Liability", money(l.amount())}));
        rows.add(new String[]{"", "Total liabilities", "", money(report.totalLiabilities())});
        report.equity().forEach(l -> rows.add(new String[]{l.code(), l.name(), "Equity", money(l.amount())}));
        rows.add(new String[]{"", "Current earnings", "", money(report.currentEarnings())});
        rows.add(new String[]{"", "Total equity", "", money(report.totalEquity())});
        rows.add(new String[]{"", "Difference", "", money(report.difference())});
        return render(format, "Balance Sheet", "As of " + DATE.format(report.asOf()), headers, rows,
                List.of(), List.<BigDecimal[]>of(new BigDecimal[]{report.totalAssets(), report.totalLiabilities(),
                        report.totalEquity(), report.difference()}));
    }

    // ---------- GST summary ----------

    @Transactional(readOnly = true)
    public byte[] gstSummary(Long branchId, LocalDate from, LocalDate to, String format) {
        requireExport();
        AccountingDtos.GstSummaryResponse report = accountingReportService.gstSummary(branchId, from, to);
        String[] headers = {"Section", "Tax rate %", "Taxable amount", "Tax amount", "Quantity"};
        List<String[]> rows = new ArrayList<>();
        report.salesByRate().forEach(r -> rows.add(new String[]{"Sales", rate(r.taxRate()),
                money(r.taxableAmount()), money(r.taxAmount()), String.valueOf(r.quantity())}));
        report.purchasesByRate().forEach(r -> rows.add(new String[]{"Purchases", rate(r.taxRate()),
                money(r.taxableAmount()), money(r.taxAmount()), String.valueOf(r.quantity())}));
        rows.add(new String[]{"Output tax", "", "", money(report.outputTax()), ""});
        rows.add(new String[]{"Input tax", "", "", money(report.inputTax()), ""});
        rows.add(new String[]{"Net payable", "", "", money(report.netPayable()), ""});
        return render(format, "GST Summary", range(report.from(), report.to()), headers, rows, List.of(),
                List.<BigDecimal[]>of(new BigDecimal[]{report.outputTax(), report.inputTax(), report.netPayable()}));
    }

    // ---------- Day book ----------

    @Transactional(readOnly = true)
    public byte[] dayBook(Long branchId, LocalDate from, LocalDate to, String format) {
        requireExport();
        AccountingDtos.DayBookResponse report = accountingReportService.dayBook(branchId, from, to);
        String[] headers = {"Date", "Entry no", "Description", "Branch", "Source", "Debit", "Credit"};
        List<String[]> rows = new ArrayList<>();
        for (AccountingDtos.JournalResponse entry : report.entries()) {
            BigDecimal debit = entry.lines().stream().map(AccountingDtos.JournalLineResponse::debit)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal credit = entry.lines().stream().map(AccountingDtos.JournalLineResponse::credit)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            rows.add(new String[]{DATE.format(entry.entryDate()), entry.entryNo(), entry.description(),
                    entry.branchName(), entry.sourceType(), money(debit), money(credit)});
        }
        return render(format, "Day Book", range(report.from(), report.to()), headers, rows, List.of(), List.of());
    }

    // ---------- Account ledger ----------

    @Transactional(readOnly = true)
    public byte[] accountLedger(Long accountId, Long branchId, LocalDate from, LocalDate to, String format) {
        requireExport();
        AccountingDtos.AccountLedgerResponse report = accountingReportService
                .accountLedger(accountId, branchId, from, to);
        String[] headers = {"Date", "Entry no", "Description", "Branch", "Debit", "Credit", "Balance"};
        List<String[]> rows = report.rows().stream()
                .map(r -> new String[]{DATE.format(r.date()), r.entryNo(), r.description(), r.branchName(),
                        money(r.debit()), money(r.credit()), money(r.balance())})
                .toList();
        List<String[]> footer = List.<String[]>of(
                new String[]{"", "Opening balance", "", "", "", "", money(report.openingBalance())},
                new String[]{"", "Totals", "", "", money(report.totalDebit()), money(report.totalCredit()),
                        money(report.closingBalance())});
        String subtitle = report.code() + " - " + report.name() + " | " + range(report.from(), report.to());
        return render(format, "Account Ledger", subtitle, headers, rows, footer,
                List.<BigDecimal[]>of(new BigDecimal[]{report.openingBalance(), report.closingBalance()}));
    }

    // ---------- Rendering ----------

    private byte[] render(String format, String title, String subtitle, String[] headers,
                          List<String[]> rows, List<String[]> footer, List<BigDecimal[]> summaryRows) {
        String normalized = format == null ? "pdf" : format.trim().toLowerCase();
        return switch (normalized) {
            case "xlsx", "excel" -> excel(title, subtitle, headers, rows, footer);
            case "pdf" -> pdf(title, subtitle, headers, rows, footer);
            default -> throw ApiException.badRequest("UNSUPPORTED_FORMAT", "Supported export formats are pdf and xlsx.");
        };
    }

    private byte[] pdf(String title, String subtitle, String[] headers, List<String[]> rows,
                       List<String[]> footer) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4.rotate(), 32, 32, 36, 36);
            PdfWriter.getInstance(document, out);
            document.open();

            Font brand = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16, new Color(43, 39, 36));
            Font heading = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 13, new Color(43, 39, 36));
            Font meta = FontFactory.getFont(FontFactory.HELVETICA, 9, new Color(100, 94, 87));
            Font body = FontFactory.getFont(FontFactory.HELVETICA, 8.5f, new Color(43, 39, 36));
            Font head = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8.5f, new Color(43, 39, 36));

            Paragraph business = new Paragraph(businessName(), brand);
            business.setSpacingAfter(2);
            document.add(business);
            Paragraph reportTitle = new Paragraph(title, heading);
            reportTitle.setSpacingAfter(2);
            document.add(reportTitle);
            Paragraph metaLine = new Paragraph(subtitle + "   |   Generated " + DATE.format(LocalDate.now())
                    + " by " + currentUserService.require().getFullName(), meta);
            metaLine.setSpacingAfter(12);
            document.add(metaLine);

            PdfPTable table = new PdfPTable(headers.length);
            table.setWidthPercentage(100);
            table.setHeaderRows(1);
            for (String header : headers) {
                PdfPCell cell = new PdfPCell(new Phrase(header, head));
                cell.setBackgroundColor(HEADER_BG);
                cell.setBorderColor(LINE);
                cell.setPadding(5);
                table.addCell(cell);
            }
            for (String[] row : rows) {
                for (String value : row) {
                    PdfPCell cell = new PdfPCell(new Phrase(value == null ? "" : value, body));
                    cell.setBorderColor(LINE);
                    cell.setPadding(4);
                    table.addCell(cell);
                }
            }
            for (String[] row : footer) {
                for (String value : row) {
                    PdfPCell cell = new PdfPCell(new Phrase(value == null ? "" : value, head));
                    cell.setBackgroundColor(new Color(249, 246, 240));
                    cell.setBorderColor(LINE);
                    cell.setPadding(5);
                    table.addCell(cell);
                }
            }
            document.add(table);
            document.close();
            return out.toByteArray();
        } catch (Exception ex) {
            throw new IllegalStateException("Could not generate PDF report.", ex);
        }
    }

    private byte[] excel(String title, String subtitle, String[] headers, List<String[]> rows,
                         List<String[]> footer) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet(title.replace("&", "and"));
            CellStyle titleStyle = workbook.createCellStyle();
            org.apache.poi.ss.usermodel.Font titleFont = workbook.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 14);
            titleStyle.setFont(titleFont);

            CellStyle headerStyle = workbook.createCellStyle();
            org.apache.poi.ss.usermodel.Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);
            headerStyle.setAlignment(HorizontalAlignment.LEFT);
            headerStyle.setVerticalAlignment(VerticalAlignment.CENTER);

            CellStyle bodyStyle = workbook.createCellStyle();
            bodyStyle.setBorderBottom(BorderStyle.HAIR);

            int rowIndex = 0;
            Row titleRow = sheet.createRow(rowIndex++);
            Cell titleCell = titleRow.createCell(0);
            titleCell.setCellValue(businessName() + " - " + title);
            titleCell.setCellStyle(titleStyle);

            Row metaRow = sheet.createRow(rowIndex++);
            metaRow.createCell(0).setCellValue(subtitle + " | Generated " + DATE.format(LocalDate.now())
                    + " by " + currentUserService.require().getFullName());
            rowIndex++;

            Row headerRow = sheet.createRow(rowIndex++);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }
            for (String[] row : rows) {
                Row dataRow = sheet.createRow(rowIndex++);
                for (int i = 0; i < row.length; i++) {
                    Cell cell = dataRow.createCell(i);
                    cell.setCellValue(row[i] == null ? "" : row[i]);
                    cell.setCellStyle(bodyStyle);
                }
            }
            for (String[] row : footer) {
                Row dataRow = sheet.createRow(rowIndex++);
                for (int i = 0; i < row.length; i++) {
                    Cell cell = dataRow.createCell(i);
                    cell.setCellValue(row[i] == null ? "" : row[i]);
                    cell.setCellStyle(headerStyle);
                }
            }
            for (int i = 0; i < headers.length; i++) {
                int width = headers[i].length() + 4;
                for (String[] row : rows) {
                    if (i < row.length && row[i] != null) {
                        width = Math.max(width, row[i].length() + 2);
                    }
                }
                sheet.setColumnWidth(i, Math.min(255, width) * 256);
            }
            sheet.createFreezePane(0, 4);
            workbook.write(out);
            return out.toByteArray();
        } catch (Exception ex) {
            throw new IllegalStateException("Could not generate Excel report.", ex);
        }
    }

    // ---------- Helpers ----------

    private void requireExport() {
        currentUserService.requirePermission(Permissions.REPORT_EXPORT);
    }

    private String businessName() {
        Business business = businessRepository.findById(currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        return business.getName();
    }

    private String range(LocalDate from, LocalDate to) {
        if (from == null && to == null) {
            return "All dates";
        }
        return (from == null ? "Beginning" : DATE.format(from)) + " to "
                + (to == null ? "today" : DATE.format(to));
    }

    private String money(BigDecimal value) {
        return Money.of(value).toPlainString();
    }

    private String rate(BigDecimal value) {
        return value == null ? "0" : value.stripTrailingZeros().toPlainString();
    }
}
