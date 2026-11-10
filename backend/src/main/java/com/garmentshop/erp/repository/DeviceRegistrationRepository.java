package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.DeviceRegistration;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DeviceRegistrationRepository extends JpaRepository<DeviceRegistration, Long> {

    Optional<DeviceRegistration> findByDeviceId(String deviceId);

    Optional<DeviceRegistration> findByDeviceIdAndBusinessId(String deviceId, Long businessId);

    List<DeviceRegistration> findByBusinessIdOrderByLastSeenAtDesc(Long businessId);

    List<DeviceRegistration> findByBusinessIdAndBranchIdOrderByLastSeenAtDesc(Long businessId, Long branchId);
}
