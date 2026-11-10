package com.garmentshop.erp.sales;

import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Numbering;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.InvoiceSequence;
import com.garmentshop.erp.repository.InvoiceSequenceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

@Service
@RequiredArgsConstructor
public class InvoiceNumberService {

    private final InvoiceSequenceRepository sequenceRepository;

    @Transactional
    public InvoiceNumber allocate(Branch branch, LocalDate date, int financialYearStartMonth) {
        FinancialYear financialYear = FinancialYear.of(date, financialYearStartMonth);
        InvoiceSequence sequence = sequenceRepository
                .findForUpdate(branch.getId(), financialYear.label())
                .orElseGet(() -> {
                    InvoiceSequence created = new InvoiceSequence();
                    created.setBranch(branch);
                    created.setFinancialYear(financialYear.label());
                    created.setPrefix(branch.getInvoicePrefix());
                    created.setNextNumber(1);
                    return sequenceRepository.save(created);
                });
        long number = sequence.getNextNumber();
        sequence.setNextNumber(number + 1);
        sequenceRepository.save(sequence);
        String prefix = sequence.getPrefix() == null || sequence.getPrefix().isBlank()
                ? branch.getInvoicePrefix() : sequence.getPrefix();
        return new InvoiceNumber(Numbering.sequence(prefix, financialYear.label(), number), financialYear.label());
    }

    public record InvoiceNumber(String invoiceNo, String financialYear) {
    }
}
