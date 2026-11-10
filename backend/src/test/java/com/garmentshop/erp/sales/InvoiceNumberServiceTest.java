package com.garmentshop.erp.sales;

import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.InvoiceSequence;
import com.garmentshop.erp.repository.InvoiceSequenceRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InvoiceNumberServiceTest {

    private final InvoiceSequenceRepository repository = mock(InvoiceSequenceRepository.class);

    @Test
    void incrementsAnExistingSequence() {
        Branch branch = branch(7L, "AGM");
        InvoiceSequence sequence = sequence(branch, "2026-27", "AGM", 42);
        when(repository.findForUpdate(7L, "2026-27")).thenReturn(Optional.of(sequence));
        when(repository.save(any(InvoiceSequence.class))).thenAnswer(invocation -> invocation.getArgument(0));

        InvoiceNumberService.InvoiceNumber number = new InvoiceNumberService(repository)
                .allocate(branch, LocalDate.of(2026, 11, 10), 4);

        assertThat(number.invoiceNo()).isEqualTo("AGM/2026-27/000042");
        assertThat(number.financialYear()).isEqualTo("2026-27");
        assertThat(sequence.getNextNumber()).isEqualTo(43);
    }

    @Test
    void createsTheFirstSequenceForANewFinancialYear() {
        Branch branch = branch(3L, "VT");
        when(repository.findForUpdate(3L, "2026-27")).thenReturn(Optional.empty());
        when(repository.save(any(InvoiceSequence.class))).thenAnswer(invocation -> invocation.getArgument(0));

        InvoiceNumberService.InvoiceNumber number = new InvoiceNumberService(repository)
                .allocate(branch, LocalDate.of(2026, 4, 1), 4);

        assertThat(number.invoiceNo()).isEqualTo("VT/2026-27/000001");
        ArgumentCaptor<InvoiceSequence> saved = ArgumentCaptor.forClass(InvoiceSequence.class);
        verify(repository, times(2)).save(saved.capture());
        InvoiceSequence created = saved.getAllValues().get(0);
        assertThat(created.getBranch()).isSameAs(branch);
        assertThat(created.getFinancialYear()).isEqualTo("2026-27");
        assertThat(created.getPrefix()).isEqualTo("VT");
        assertThat(created.getNextNumber()).isEqualTo(2);
    }

    @Test
    void fallsBackToBranchPrefixWhenTheSequencePrefixIsBlank() {
        Branch branch = branch(9L, "VT");
        InvoiceSequence sequence = sequence(branch, "2026-27", " ", 5);
        when(repository.findForUpdate(9L, "2026-27")).thenReturn(Optional.of(sequence));
        when(repository.save(any(InvoiceSequence.class))).thenAnswer(invocation -> invocation.getArgument(0));

        InvoiceNumberService.InvoiceNumber number = new InvoiceNumberService(repository)
                .allocate(branch, LocalDate.of(2026, 5, 1), 4);

        assertThat(number.invoiceNo()).isEqualTo("VT/2026-27/000005");
    }

    private Branch branch(Long id, String invoicePrefix) {
        Branch branch = new Branch();
        branch.setId(id);
        branch.setInvoicePrefix(invoicePrefix);
        return branch;
    }

    private InvoiceSequence sequence(Branch branch, String financialYear, String prefix, long nextNumber) {
        InvoiceSequence sequence = new InvoiceSequence();
        sequence.setBranch(branch);
        sequence.setFinancialYear(financialYear);
        sequence.setPrefix(prefix);
        sequence.setNextNumber(nextNumber);
        return sequence;
    }
}
