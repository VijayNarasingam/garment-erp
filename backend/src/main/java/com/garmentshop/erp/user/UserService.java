package com.garmentshop.erp.user;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.Role;
import com.garmentshop.erp.domain.User;
import com.garmentshop.erp.repository.BranchRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.RoleRepository;
import com.garmentshop.erp.repository.UserRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final BranchRepository branchRepository;
    private final BusinessRepository businessRepository;
    private final PasswordEncoder passwordEncoder;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<UserDtos.UserResponse> list() {
        Long businessId = currentUserService.businessId();
        UserPrincipal principal = currentUserService.require();
        List<Long> allowedBranches = currentUserService.accessibleBranchIds();
        return userRepository.findByBusinessIdOrderByFullNameAsc(businessId).stream()
                .filter(u -> principal.isOwner() || u.getBranches().stream().anyMatch(b -> allowedBranches.contains(b.getId())))
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public UserDtos.UserResponse create(UserDtos.CreateUserRequest request) {
        Long businessId = currentUserService.businessId();
        if (userRepository.existsByUsernameIgnoreCase(request.username())) {
            throw ApiException.conflict("DUPLICATE_USERNAME", "This username is already in use.");
        }
        if (userRepository.existsByEmailIgnoreCase(request.email())) {
            throw ApiException.conflict("DUPLICATE_EMAIL", "This email is already in use.");
        }
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        User user = new User();
        user.setBusiness(business);
        user.setUsername(request.username().trim().toLowerCase());
        user.setEmail(request.email().trim().toLowerCase());
        user.setFullName(request.fullName().trim());
        user.setPhone(request.phone());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        if (request.pin() != null && !request.pin().isBlank()) {
            user.setPinHash(passwordEncoder.encode(request.pin()));
        }
        applyAccess(user, request.roleIds(), request.branchIds(), request.defaultBranchId());
        userRepository.save(user);
        auditService.log("USER_CREATED", "USER", user.getId(), null,
                Map.of("username", user.getUsername(), "roles", roleCodes(user), "branches", branchIds(user)),
                "User account created", null, null);
        return toResponse(user);
    }

    @Transactional
    public UserDtos.UserResponse update(Long id, UserDtos.UpdateUserRequest request) {
        Long businessId = currentUserService.businessId();
        User user = userRepository.findById(id)
                .filter(u -> u.getBusiness() != null && u.getBusiness().getId().equals(businessId))
                .orElseThrow(() -> ApiException.notFound("User not found."));
        UserPrincipal actor = currentUserService.require();
        if (!actor.isOwner() && isOwner(user)) {
            throw ApiException.forbidden("OWNER_PROTECTED", "Only an owner can modify an owner account.");
        }
        if (Objects.equals(user.getId(), actor.getId()) && !request.active()) {
            throw ApiException.badRequest("SELF_DEACTIVATE", "You cannot deactivate your own account.");
        }
        if (isOwner(user) && (!request.active() || !containsOwnerRole(request.roleIds()))) {
            long otherOwners = userRepository.findByBusinessIdOrderByFullNameAsc(businessId).stream()
                    .filter(u -> !u.getId().equals(user.getId()) && u.isActive() && isOwner(u))
                    .count();
            if (otherOwners == 0) {
                throw ApiException.badRequest("LAST_OWNER", "At least one active owner account is required.");
            }
        }
        Map<String, Object> before = Map.of("fullName", user.getFullName(), "active", user.isActive(),
                "roles", roleCodes(user), "branches", branchIds(user));
        if (userRepository.existsByEmailIgnoreCase(request.email())
                && !user.getEmail().equalsIgnoreCase(request.email())) {
            throw ApiException.conflict("DUPLICATE_EMAIL", "This email is already in use.");
        }
        user.setEmail(request.email().trim().toLowerCase());
        user.setFullName(request.fullName().trim());
        user.setPhone(request.phone());
        user.setActive(request.active());
        applyAccess(user, request.roleIds(), request.branchIds(), request.defaultBranchId());
        userRepository.save(user);
        auditService.log("USER_UPDATED", "USER", user.getId(), before,
                Map.of("fullName", user.getFullName(), "active", user.isActive(),
                        "roles", roleCodes(user), "branches", branchIds(user)),
                "User account updated", null, null);
        return toResponse(user);
    }

    @Transactional
    public void resetPassword(Long id, UserDtos.ResetPasswordRequest request) {
        Long businessId = currentUserService.businessId();
        User user = userRepository.findById(id)
                .filter(u -> u.getBusiness() != null && u.getBusiness().getId().equals(businessId))
                .orElseThrow(() -> ApiException.notFound("User not found."));
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        userRepository.save(user);
        auditService.log("PASSWORD_RESET", "USER", user.getId(), null, null,
                "Password reset by administrator", null, null);
    }

    @Transactional
    public void setPin(Long id, UserDtos.SetUserPinRequest request) {
        Long businessId = currentUserService.businessId();
        User user = userRepository.findById(id)
                .filter(u -> u.getBusiness() != null && u.getBusiness().getId().equals(businessId))
                .orElseThrow(() -> ApiException.notFound("User not found."));
        user.setPinHash(passwordEncoder.encode(request.pin()));
        userRepository.save(user);
        auditService.log("PIN_SET", "USER", user.getId(), null, null,
                "Approval PIN set by administrator", null, null);
    }

    private void applyAccess(User user, List<Long> roleIds, List<Long> branchIds, Long defaultBranchId) {
        Long businessId = currentUserService.businessId();
        UserPrincipal actor = currentUserService.require();
        List<Role> roles = roleRepository.findAllById(roleIds);
        if (roles.size() != roleIds.size()) {
            throw ApiException.badRequest("INVALID_ROLE", "One or more roles do not exist.");
        }
        for (Role role : roles) {
            if (role.getBusiness() == null || !role.getBusiness().getId().equals(businessId)) {
                throw ApiException.badRequest("INVALID_ROLE", "Role " + role.getCode() + " belongs to another business.");
            }
            if (!actor.isOwner() && (role.getCode().equals("SUPER_ADMIN") || role.getCode().equals("BUSINESS_OWNER"))) {
                throw ApiException.forbidden("ROLE_ESCALATION", "Only an owner can assign the owner role.");
            }
            if (!actor.isOwner()) {
                for (var permission : role.getPermissions()) {
                    if (!actor.hasPermission(permission.getCode())) {
                        throw ApiException.forbidden("ROLE_ESCALATION",
                                "You cannot grant permission you do not hold: " + permission.getCode());
                    }
                }
            }
        }
        List<Branch> branches = branchRepository.findAllById(branchIds);
        if (branches.size() != branchIds.size()) {
            throw ApiException.badRequest("INVALID_BRANCH", "One or more branches do not exist.");
        }
        for (Branch branch : branches) {
            if (!branch.getBusiness().getId().equals(businessId)) {
                throw ApiException.badRequest("INVALID_BRANCH", "Branch belongs to another business.");
            }
            if (!actor.isOwner() && !actor.getBranchIds().contains(branch.getId())) {
                throw ApiException.forbidden("BRANCH_ACCESS", "You cannot assign a branch you cannot access.");
            }
        }
        Branch defaultBranch = null;
        if (defaultBranchId != null) {
            defaultBranch = branches.stream().filter(b -> b.getId().equals(defaultBranchId)).findFirst()
                    .orElseThrow(() -> ApiException.badRequest("INVALID_DEFAULT_BRANCH",
                            "Default branch must be one of the assigned branches."));
        }
        user.setRoles(new HashSet<>(roles));
        user.setBranches(new HashSet<>(branches));
        user.setDefaultBranch(defaultBranch);
    }

    private boolean containsOwnerRole(List<Long> roleIds) {
        return roleRepository.findAllById(roleIds).stream()
                .anyMatch(r -> r.getCode().equals("SUPER_ADMIN") || r.getCode().equals("BUSINESS_OWNER"));
    }

    private boolean isOwner(User user) {
        return user.getRoles().stream()
                .anyMatch(r -> r.getCode().equals("SUPER_ADMIN") || r.getCode().equals("BUSINESS_OWNER"));
    }

    private List<String> roleCodes(User user) {
        return user.getRoles().stream().map(Role::getCode).sorted().toList();
    }

    private List<Long> branchIds(User user) {
        return user.getBranches().stream().map(Branch::getId).sorted().toList();
    }

    public UserDtos.UserResponse toResponse(User user) {
        List<UserDtos.RoleSummary> roles = user.getRoles().stream()
                .sorted(java.util.Comparator.comparing(Role::getName))
                .map(r -> new UserDtos.RoleSummary(r.getId(), r.getCode(), r.getName(), r.isSystemRole(),
                        r.getDiscountLimitPercent(),
                        r.getPermissions().stream().map(p -> p.getCode()).sorted().toList()))
                .toList();
        List<UserDtos.BranchSummary> branches = user.getBranches().stream()
                .sorted(java.util.Comparator.comparing(Branch::getName))
                .map(b -> new UserDtos.BranchSummary(b.getId(), b.getCode(), b.getName()))
                .toList();
        return new UserDtos.UserResponse(user.getId(), user.getUsername(), user.getEmail(), user.getFullName(),
                user.getPhone(), user.isActive(), roles, branches,
                user.getDefaultBranch() == null ? null : user.getDefaultBranch().getId(),
                user.getPinHash() != null, user.getLastLoginAt());
    }

    public List<UserDtos.RoleResponse> allRoles() {
        return roleRepository.findByBusinessIdOrderByNameAsc(currentUserService.businessId()).stream()
                .map(this::toRoleResponse)
                .toList();
    }

    public UserDtos.RoleResponse toRoleResponse(Role role) {
        List<UserDtos.AuthPermission> permissions = role.getPermissions().stream()
                .sorted(java.util.Comparator.comparing(p -> p.getCode()))
                .map(p -> new UserDtos.AuthPermission(p.getId(), p.getCode(), p.getModule(), p.getDescription()))
                .toList();
        return new UserDtos.RoleResponse(role.getId(), role.getCode(), role.getName(), role.getDescription(),
                role.isSystemRole(), role.getDiscountLimitPercent(), permissions);
    }
}
