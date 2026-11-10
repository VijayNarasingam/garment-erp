package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CategoryRepository extends JpaRepository<Category, Long> {

    List<Category> findByBusinessIdOrderByNameAsc(Long businessId);

    List<Category> findByBusinessIdAndActiveTrueOrderByNameAsc(Long businessId);

    Optional<Category> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndNameIgnoreCase(Long businessId, String name);
}
