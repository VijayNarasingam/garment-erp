package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.CostingConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CostingConfigRepository extends JpaRepository<CostingConfig, Long> {
    List<CostingConfig> findByBusinessIdOrderByEffectiveFromDescCreatedAtDesc(Long businessId);

    java.util.Optional<CostingConfig> findFirstByBusinessIdOrderByEffectiveFromDescCreatedAtDesc(Long businessId);
}
