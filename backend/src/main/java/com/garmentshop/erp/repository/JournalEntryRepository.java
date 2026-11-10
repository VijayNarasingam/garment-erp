package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.JournalEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {

    Optional<JournalEntry> findByIdAndBusinessId(Long id, Long businessId);

    List<JournalEntry> findBySourceTypeAndSourceId(com.garmentshop.erp.domain.JournalSource sourceType, String sourceId);

    @Query(value = """
            select j from JournalEntry j
            where j.businessId = :businessId
              and (:branchId is null or j.branch.id = :branchId)
              and (:source is null or j.sourceType = :source)
              and (:from is null or j.entryDate >= :from)
              and (:to is null or j.entryDate <= :to)
            order by j.entryDate desc, j.id desc
            """,
            countQuery = """
            select count(j) from JournalEntry j
            where j.businessId = :businessId
              and (:branchId is null or j.branch.id = :branchId)
              and (:source is null or j.sourceType = :source)
              and (:from is null or j.entryDate >= :from)
              and (:to is null or j.entryDate <= :to)
            """)
    Page<JournalEntry> search(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                              @Param("source") com.garmentshop.erp.domain.JournalSource source,
                              @Param("from") LocalDate from, @Param("to") LocalDate to, Pageable pageable);

    @Query(value = """
            select j from JournalEntry j
            where j.businessId = :businessId
              and (:branchId is null or j.branch.id = :branchId)
              and j.entryDate between :from and :to
              and j.status = com.garmentshop.erp.domain.EntryStatus.POSTED
            order by j.entryDate asc, j.id asc
            """)
    List<JournalEntry> findForPeriod(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                     @Param("from") LocalDate from, @Param("to") LocalDate to);
}
