package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.JournalLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface JournalLineRepository extends JpaRepository<JournalLine, Long> {

    @Query("""
            select l.account.id, l.account.code, l.account.name, l.account.type,
                   coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
            from JournalLine l join l.journalEntry j
            where j.businessId = :businessId
              and j.status = com.garmentshop.erp.domain.EntryStatus.POSTED
              and (:branchId is null or j.branch.id = :branchId)
              and j.entryDate between :from and :to
            group by l.account.id, l.account.code, l.account.name, l.account.type
            order by l.account.code
            """)
    List<Object[]> trialBalance(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select j.id, j.entryNo, j.entryDate, j.description, j.sourceType, j.status,
                   l.debit, l.credit, j.branch.name, l.description
            from JournalLine l join l.journalEntry j
            where j.businessId = :businessId and l.account.id = :accountId
              and j.status = com.garmentshop.erp.domain.EntryStatus.POSTED
              and (:branchId is null or j.branch.id = :branchId)
              and j.entryDate between :from and :to
            order by j.entryDate asc, j.id asc
            """)
    List<Object[]> accountLedger(@Param("businessId") Long businessId, @Param("accountId") Long accountId,
                                 @Param("branchId") Long branchId, @Param("from") LocalDate from,
                                 @Param("to") LocalDate to);

    @Query("""
            select l.account.type, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
            from JournalLine l join l.journalEntry j
            where j.businessId = :businessId and j.status = com.garmentshop.erp.domain.EntryStatus.POSTED
              and (:branchId is null or j.branch.id = :branchId)
              and j.entryDate between :from and :to
            group by l.account.type
            """)
    List<Object[]> totalsByType(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                                @Param("from") LocalDate from, @Param("to") LocalDate to);
}
