package com.garmentshop.erp.common;

import com.garmentshop.erp.domain.DocumentSequence;
import com.garmentshop.erp.repository.DocumentSequenceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SequenceService {

    private final DocumentSequenceRepository sequenceRepository;

    @Transactional
    public String next(Long businessId, String key, String prefix, String financialYear) {
        String fullKey = key + ":" + financialYear;
        DocumentSequence sequence = sequenceRepository.findForUpdate(businessId, fullKey)
                .orElseGet(() -> {
                    DocumentSequence created = new DocumentSequence();
                    created.setBusinessId(businessId);
                    created.setSequenceKey(fullKey);
                    created.setNextNumber(1);
                    return sequenceRepository.save(created);
                });
        long number = sequence.getNextNumber();
        sequence.setNextNumber(number + 1);
        sequenceRepository.save(sequence);
        return Numbering.sequence(prefix, financialYear, number);
    }
}
