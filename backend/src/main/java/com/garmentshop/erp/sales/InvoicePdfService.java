package com.garmentshop.erp.sales;

import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.Invoice;
import com.garmentshop.erp.domain.InvoiceCharge;
import com.garmentshop.erp.domain.InvoiceItem;
import com.garmentshop.erp.domain.Payment;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.InvoiceRepository;
import com.garmentshop.erp.repository.PaymentRepository;
import com.garmentshop.erp.security.CurrentUserService;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;

/**
 * A4 invoice PDF. Layout (all customisable through Business settings):
 * shop name, address and contact line at the top; bill number, date, branch
 * and seller (billed by) name; customer name; item table; totals; and the
 * shop's thank-you note at the bottom. GST-only fields disappear when the
 * invoice was posted with GST disabled.
 */
@Service
@RequiredArgsConstructor
public class InvoicePdfService {

    private final InvoiceRepository invoiceRepository;
    private final PaymentRepository paymentRepository;
    private final BusinessRepository businessRepository;
    private final CurrentUserService currentUserService;

    @Transactional(readOnly = true)
    public byte[] render(Long invoiceId) {
        Invoice invoice = invoiceRepository.findByIdAndBusinessId(invoiceId, currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Invoice not found."));
        currentUserService.assertBranch(invoice.getBranch().getId());
        Business business = businessRepository.findById(currentUserService.businessId())
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        boolean gst = invoice.isGstEnabled();
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 36, 36, 36, 48);
            PdfWriter.getInstance(document, out);
            document.open();

            Font title = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16, new Color(40, 38, 34));
            Font heading = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10, new Color(40, 38, 34));
            Font body = FontFactory.getFont(FontFactory.HELVETICA, 9, new Color(40, 38, 34));
            Font small = FontFactory.getFont(FontFactory.HELVETICA, 8, new Color(95, 90, 82));

            Paragraph businessName = new Paragraph(business.getName(), title);
            businessName.setAlignment(Element.ALIGN_CENTER);
            document.add(businessName);
            Paragraph address = new Paragraph(nvl(business.getAddress()) + "\n" + contactLine(business, gst), small);
            address.setAlignment(Element.ALIGN_CENTER);
            document.add(address);
            document.add(new Paragraph(" "));

            PdfPTable meta = new PdfPTable(new float[]{1, 1});
            meta.setWidthPercentage(100);
            PdfPCell left = borderless(new Phrase((gst ? "TAX INVOICE" : "INVOICE") + "\n" + invoice.getBranch().getName()
                    + "\n" + nvl(invoice.getBranch().getAddress())
                    + (gst ? "\nGSTIN: " + nvl(invoice.getBranch().getGstin()) : ""), body));
            StringBuilder metaRight = new StringBuilder("Invoice No: " + invoice.getInvoiceNo())
                    .append("\nDate: ").append(invoice.getInvoiceDate().format(DateTimeFormatter.ISO_DATE));
            if (gst && invoice.getPlaceOfSupplyStateCode() != null && !invoice.getPlaceOfSupplyStateCode().isBlank()) {
                metaRight.append("\nPlace of supply: ").append(invoice.getPlaceOfSupplyStateCode());
            }
            PdfPCell right = borderless(new Phrase(metaRight.toString(), body));
            meta.addCell(left);
            meta.addCell(right);
            document.add(meta);
            document.add(new Paragraph(" "));

            PdfPTable customer = new PdfPTable(new float[]{1, 1});
            customer.setWidthPercentage(100);
            PdfPCell billTo = borderless(new Phrase("BILL TO\n" + nvl(invoice.getCustomerName())
                    + (nvl(invoice.getCustomerPhone()).isBlank() ? "" : "\n" + invoice.getCustomerPhone())
                    + (gst && !nvl(invoice.getCustomerGstin()).isBlank() ? "\nGSTIN: " + invoice.getCustomerGstin() : ""), body));
            PdfPCell billedBy = borderless(new Phrase("BILLED BY\n" + nvl(invoice.getCreatedByName())
                    + "\n\nPAYMENT\nPaid: " + money(invoice.getPaidAmount())
                    + "\nBalance: " + money(invoice.getBalanceAmount())
                    + "\nMode: " + paymentMethods(invoiceId), body));
            customer.addCell(billTo);
            customer.addCell(billedBy);
            document.add(customer);
            document.add(new Paragraph(" "));

            PdfPTable items = gst
                    ? new PdfPTable(new float[]{0.5f, 2.6f, 1.3f, 0.7f, 0.7f, 1.1f, 0.9f, 0.9f, 1.2f})
                    : new PdfPTable(new float[]{0.5f, 3.0f, 1.5f, 0.8f, 0.8f, 1.2f, 1.0f, 1.3f});
            items.setWidthPercentage(100);
            String[] headers = gst
                    ? new String[]{"#", "Item", "SKU", "Size", "Qty", "Rate", "Disc.", "Tax", "Amount"}
                    : new String[]{"#", "Item", "SKU", "Size", "Qty", "Rate", "Disc.", "Amount"};
            for (String header : headers) {
                PdfPCell cell = new PdfPCell(new Phrase(header, heading));
                cell.setBackgroundColor(new Color(244, 239, 230));
                cell.setBorderColor(new Color(215, 207, 194));
                cell.setPadding(5);
                items.addCell(cell);
            }
            int index = 1;
            for (InvoiceItem item : invoice.getItems()) {
                items.addCell(cell(String.valueOf(index++), body));
                items.addCell(cell(item.getProductName() + (item.getColor() == null ? "" : " / " + item.getColor()), body));
                items.addCell(cell(item.getSku(), body));
                items.addCell(cell(nvl(item.getSize()), body));
                items.addCell(cell(String.valueOf(item.getQuantity()), body));
                items.addCell(cell(money(item.getUnitPrice()), body));
                items.addCell(cell(money(item.getDiscountAmount()), body));
                if (gst) {
                    items.addCell(cell(money(item.getTaxAmount()) + "\n@" + item.getTaxRate() + "%", body));
                }
                items.addCell(cell(money(item.getLineTotal()), body));
            }
            document.add(items);
            document.add(new Paragraph(" "));

            PdfPTable totals = new PdfPTable(new float[]{3, 1});
            totals.setWidthPercentage(45);
            totals.setHorizontalAlignment(Element.ALIGN_RIGHT);
            totalRow(totals, "Subtotal", invoice.getSubtotal(), body);
            totalRow(totals, "Item discount", invoice.getItemDiscount().negate(), body);
            totalRow(totals, "Bill discount", invoice.getBillDiscount().negate(), body);
            totalRow(totals, "Taxable amount", invoice.getTaxableAmount(), body);
            if (gst) {
                totalRow(totals, "GST", invoice.getTaxTotal(), body);
            }
            if (invoice.getRoundOff().signum() != 0) {
                totalRow(totals, "Round off", invoice.getRoundOff(), body);
            }
            totalRow(totals, "TOTAL", invoice.getTotal(), heading);
            document.add(totals);

            if (!invoice.getCharges().isEmpty()) {
                document.add(new Paragraph("Charges", heading));
                for (InvoiceCharge charge : invoice.getCharges()) {
                    String line = charge.getName() + " - " + money(charge.getAmount())
                            + (gst ? " (tax " + money(charge.getTaxAmount()) + ")" : "");
                    document.add(new Paragraph(line, small));
                }
            }
            if (invoice.getNotes() != null && !invoice.getNotes().isBlank()) {
                document.add(new Paragraph("Notes: " + invoice.getNotes(), small));
            }

            String thankYouNote = business.getThankYouNote() == null ? "" : business.getThankYouNote().trim();
            if (!thankYouNote.isBlank()) {
                document.add(new Paragraph(" "));
                Paragraph note = new Paragraph(thankYouNote, heading);
                note.setAlignment(Element.ALIGN_CENTER);
                document.add(note);
            }
            document.add(new Paragraph(" "));
            Paragraph footer = new Paragraph("This is a computer-generated invoice. Posted transactions are never "
                    + "edited; corrections are made through cancellation, amendment or return documents.", small);
            footer.setAlignment(Element.ALIGN_CENTER);
            document.add(footer);
            document.close();
            return out.toByteArray();
        } catch (Exception ex) {
            throw new IllegalStateException("Could not render invoice PDF", ex);
        }
    }

    private String contactLine(Business business, boolean gst) {
        StringBuilder contact = new StringBuilder();
        if (gst && !nvl(business.getGstin()).isBlank()) {
            contact.append("GSTIN: ").append(business.getGstin()).append("  |  ");
        }
        if (!nvl(business.getPhone()).isBlank()) {
            contact.append("Contact: ").append(business.getPhone());
        }
        if (!nvl(business.getEmail()).isBlank()) {
            contact.append(contact.length() == 0 ? "" : "  |  ").append(business.getEmail());
        }
        return contact.toString();
    }

    private String paymentMethods(Long invoiceId) {
        return paymentRepository.findByInvoiceIdAndStatusOrderByIdAsc(invoiceId, "POSTED").stream()
                .filter(p -> p.getType() == com.garmentshop.erp.domain.PaymentType.CUSTOMER_RECEIPT)
                .map(Payment::getMethod).map(Enum::name).distinct().reduce((a, b) -> a + ", " + b)
                .orElse("Credit");
    }

    private PdfPCell borderless(Phrase phrase) {
        PdfPCell cell = new PdfPCell(phrase);
        cell.setBorder(0);
        cell.setPadding(4);
        return cell;
    }

    private PdfPCell cell(String text, Font font) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setBorderColor(new Color(225, 218, 207));
        cell.setPadding(4);
        return cell;
    }

    private void totalRow(PdfPTable table, String label, BigDecimal amount, Font font) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, font));
        labelCell.setBorder(0);
        labelCell.setPadding(3);
        PdfPCell amountCell = new PdfPCell(new Phrase(money(amount), font));
        amountCell.setBorder(0);
        amountCell.setPadding(3);
        amountCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
        table.addCell(labelCell);
        table.addCell(amountCell);
    }

    private String money(BigDecimal value) {
        return value == null ? "0.00" : value.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private String nvl(String value) {
        return value == null ? "" : value;
    }
}
