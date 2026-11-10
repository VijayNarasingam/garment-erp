package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.SyncBatch;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface SyncBatchRepository extends JpaRepository<SyncBatch, Long> {

    Optional<SyncBatch> findByBatchId(String batchId);

    @Query("select b from SyncBatch b join fetch b.branch where b.batchId = :batchId")
    Optional<SyncBatch> findByBatchIdWithBranch(@Param("batchId") String batchId);

    @Query(value = """
            select b from SyncBatch b join fetch b.branch
            where b.businessId = :businessId
              and (:branchId is null or b.branch.id = :branchId)
            order by b.createdAt desc
            """,
            countQuery = """
            select count(b) from SyncBatch b
            where b.businessId = :businessId
              and (:branchId is null or b.branch.id = :branchId)
            """)
    Page<SyncBatch> search(@Param("businessId") Long businessId, @Param("branchId") Long branchId,
                           Pageable pageable);
}
