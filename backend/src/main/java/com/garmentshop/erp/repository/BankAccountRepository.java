package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.BankAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BankAccountRepository extends JpaRepository<BankAccount, Long> {
    List<BankAccount> findByBusinessIdOrderByNameAsc(Long businessId);

    Optional<BankAccount> findByIdAndBusinessId(Long id, Long businessId);

    List<BankAccount> findByBusinessIdAndActiveTrueOrderByNameAsc(Long businessId);
}
