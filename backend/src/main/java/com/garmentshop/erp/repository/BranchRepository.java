package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Branch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BranchRepository extends JpaRepository<Branch, Long> {

    List<Branch> findByBusinessIdOrderByNameAsc(Long businessId);

    List<Branch> findByBusinessIdAndActiveTrueOrderByNameAsc(Long businessId);

    Optional<Branch> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndCodeIgnoreCase(Long businessId, String code);

    Optional<Branch> findFirstByBusinessIdAndPrimaryBranchTrue(Long businessId);
}
