package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Role;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Long> {

    List<Role> findByBusinessIdOrBusinessIsNullOrderByNameAsc(Long businessId);

    List<Role> findByBusinessIdOrderByNameAsc(Long businessId);

    Optional<Role> findByBusinessIdAndCode(Long businessId, String code);

    Optional<Role> findByCodeAndBusinessIsNull(String code);

    boolean existsByBusinessIdAndCodeIgnoreCase(Long businessId, String code);
}
