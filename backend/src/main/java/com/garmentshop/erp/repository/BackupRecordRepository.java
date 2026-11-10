package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.BackupRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BackupRecordRepository extends JpaRepository<BackupRecord, Long> {
    List<BackupRecord> findTop50ByOrderByIdDesc();
}
