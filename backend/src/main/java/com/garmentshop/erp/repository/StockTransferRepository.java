package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.StockTransfer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StockTransferRepository extends JpaRepository<StockTransfer, Long> {
    List<StockTransfer> findByBusinessIdOrderByIdDesc(Long businessId);

    Optional<StockTransfer> findByIdAndBusinessId(Long id, Long businessId);
}
