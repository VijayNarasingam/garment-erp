package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.NotificationTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NotificationTemplateRepository extends JpaRepository<NotificationTemplate, Long> {
    List<NotificationTemplate> findByBusinessIdOrderByEventTypeAscChannelAsc(Long businessId);

    Optional<NotificationTemplate> findByBusinessIdAndEventTypeAndChannel(Long businessId,
                                                                         com.garmentshop.erp.domain.NotificationEvent eventType,
                                                                         com.garmentshop.erp.domain.NotificationChannel channel);
}
