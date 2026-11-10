package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.TaxCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaxCategoryRepository extends JpaRepository<TaxCategory, Long> {

    List<TaxCategory> findByBusinessIdOrderByNameAsc(Long businessId);

    List<TaxCategory> findByBusinessIdAndActiveTrueOrderByNameAsc(Long businessId);

    Optional<TaxCategory> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndNameIgnoreCase(Long businessId, String name);

    List<TaxCategory> findByBusiness_IdAndUpdatedAtAfterOrderByNameAsc(Long businessId, java.time.Instant since);
}
