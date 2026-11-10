package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Account;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {

    List<Account> findByBusinessIdOrderByCodeAsc(Long businessId);

    List<Account> findByBusinessIdAndActiveTrueOrderByCodeAsc(Long businessId);

    Optional<Account> findByBusinessIdAndCode(Long businessId, String code);

    Optional<Account> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndCode(Long businessId, String code);
}
