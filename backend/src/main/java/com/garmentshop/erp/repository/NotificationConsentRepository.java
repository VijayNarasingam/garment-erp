package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.NotificationConsent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NotificationConsentRepository extends JpaRepository<NotificationConsent, Long> {
    Optional<NotificationConsent> findByCustomerIdAndChannel(Long customerId, com.garmentshop.erp.domain.NotificationChannel channel);

    List<NotificationConsent> findByCustomerId(Long customerId);
}
