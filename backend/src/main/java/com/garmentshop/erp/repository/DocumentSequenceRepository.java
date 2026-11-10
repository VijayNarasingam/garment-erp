package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.DocumentSequence;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface DocumentSequenceRepository extends JpaRepository<DocumentSequence, Long> {

    Optional<DocumentSequence> findByBusinessIdAndSequenceKey(Long businessId, String sequenceKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from DocumentSequence s where s.businessId = :businessId and s.sequenceKey = :key")
    Optional<DocumentSequence> findForUpdate(@Param("businessId") Long businessId, @Param("key") String key);
}
