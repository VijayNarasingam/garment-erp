package com.garmentshop.erp.user;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.Permission;
import com.garmentshop.erp.domain.Role;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.PermissionRepository;
import com.garmentshop.erp.repository.RoleRepository;
import com.garmentshop.erp.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final BusinessRepository businessRepository;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;
    private final UserService userService;

    @Transactional
    public UserDtos.RoleResponse create(UserDtos.CreateRoleRequest request) {
        Long businessId = currentUserService.businessId();
        String code = request.code().trim().toUpperCase();
        if (roleRepository.existsByBusinessIdAndCodeIgnoreCase(businessId, code)) {
            throw ApiException.conflict("DUPLICATE_ROLE", "A role with this code already exists.");
        }
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        Role role = new Role();
        role.setBusiness(business);
        role.setCode(code);
        role.setName(request.name().trim());
        role.setDescription(request.description());
        role.setDiscountLimitPercent(request.discountLimitPercent() == null ? BigDecimal.TEN : request.discountLimitPercent());
        role.setSystemRole(false);
        role.setPermissions(resolvePermissions(request.permissionCodes()));
        roleRepository.save(role);
        auditService.log("ROLE_CREATED", "ROLE", role.getId(), null,
                Map.of("code", role.getCode(), "permissions", role.getPermissions().size()),
                "Custom role created", null, null);
        return userService.toRoleResponse(role);
    }

    @Transactional
    public UserDtos.RoleResponse update(Long id, UserDtos.UpdateRoleRequest request) {
        Long businessId = currentUserService.businessId();
        Role role = roleRepository.findById(id)
                .filter(r -> r.getBusiness() != null && r.getBusiness().getId().equals(businessId))
                .orElseThrow(() -> ApiException.notFound("Role not found."));
        if (role.isSystemRole()) {
            throw ApiException.badRequest("SYSTEM_ROLE", "System roles cannot be edited. Create a custom role instead.");
        }
        Map<String, Object> before = Map.of("name", role.getName(), "permissions", role.getPermissions().size(),
                "discountLimitPercent", role.getDiscountLimitPercent());
        role.setName(request.name().trim());
        role.setDescription(request.description());
        role.setDiscountLimitPercent(request.discountLimitPercent() == null ? BigDecimal.TEN : request.discountLimitPercent());
        role.setPermissions(resolvePermissions(request.permissionCodes()));
        roleRepository.save(role);
        auditService.log("ROLE_UPDATED", "ROLE", role.getId(), before,
                Map.of("name", role.getName(), "permissions", role.getPermissions().size(),
                        "discountLimitPercent", role.getDiscountLimitPercent()),
                "Custom role updated", null, null);
        return userService.toRoleResponse(role);
    }

    private Set<Permission> resolvePermissions(Set<String> codes) {
        Set<Permission> permissions = new HashSet<>();
        for (String code : codes) {
            Permission permission = permissionRepository.findByCode(code)
                    .orElseThrow(() -> ApiException.badRequest("INVALID_PERMISSION", "Unknown permission: " + code));
            permissions.add(permission);
        }
        if (permissions.isEmpty()) {
            throw ApiException.badRequest("INVALID_PERMISSION", "At least one permission is required.");
        }
        return permissions;
    }
}
