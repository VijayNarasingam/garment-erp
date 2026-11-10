package com.garmentshop.erp.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.garmentshop.erp.domain.AuditLog;
import com.garmentshop.erp.repository.AuditLogRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final CurrentUserService currentUserService;
    private final ObjectMapper objectMapper;

    public void log(String action, String entityType, Object entityId, Object before, Object after, String reason,
                    Long branchId, String deviceId) {
        try {
            UserPrincipal principal = currentUserService.require();
            AuditLog entry = new AuditLog();
            entry.setBusinessId(principal.getBusinessId());
            entry.setBranchId(branchId);
            entry.setUserId(principal.getId());
            entry.setUsername(principal.getUsername());
            entry.setAction(action);
            entry.setEntityType(entityType);
            entry.setEntityId(entityId == null ? null : String.valueOf(entityId));
            entry.setBeforeJson(toJson(before));
            entry.setAfterJson(toJson(after));
            entry.setReason(reason);
            entry.setDeviceId(deviceId);
            entry.setIpAddress(clientIp());
            auditLogRepository.save(entry);
        } catch (Exception ex) {
            log.error("Could not write audit log for {} {}", action, entityType, ex);
        }
    }

    public void record(Long businessId, Long branchId, Long userId, String username, String action,
                       String entityType, String entityId, Object before, Object after, String reason,
                       String deviceId, String ipAddress) {
        try {
            AuditLog entry = new AuditLog();
            entry.setBusinessId(businessId);
            entry.setBranchId(branchId);
            entry.setUserId(userId);
            entry.setUsername(username);
            entry.setAction(action);
            entry.setEntityType(entityType);
            entry.setEntityId(entityId);
            entry.setBeforeJson(toJson(before));
            entry.setAfterJson(toJson(after));
            entry.setReason(reason);
            entry.setDeviceId(deviceId);
            entry.setIpAddress(ipAddress == null ? clientIp() : ipAddress);
            auditLogRepository.save(entry);
        } catch (Exception ex) {
            log.error("Could not write audit record for {} {}", action, entityType, ex);
        }
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String string) {
            return string;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{\"serializationError\":\"" + ex.getMessage().replace("\"", "'") + "\"}";
        }
    }

    public static String clientIp() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes == null) {
                return null;
            }
            HttpServletRequest request = attributes.getRequest();
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                return forwarded.split(",")[0].trim();
            }
            return request.getRemoteAddr();
        } catch (Exception ex) {
            return null;
        }
    }
}
