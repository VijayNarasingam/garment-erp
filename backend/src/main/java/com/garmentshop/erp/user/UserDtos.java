package com.garmentshop.erp.user;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

public final class UserDtos {

    private UserDtos() {
    }

    public record BranchSummary(Long id, String code, String name) {
    }

    public record RoleSummary(Long id, String code, String name, boolean systemRole,
                              BigDecimal discountLimitPercent, List<String> permissions) {
    }

    public record UserResponse(Long id, String username, String email, String fullName, String phone,
                               boolean active, List<RoleSummary> roles, List<BranchSummary> branches,
                               Long defaultBranchId, boolean hasPin, Instant lastLoginAt) {
    }

    public record CreateUserRequest(
            @NotBlank @Size(max = 60) String username,
            @NotBlank @Email @Size(max = 150) String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotBlank @Size(max = 120) String fullName,
            @Size(max = 30) String phone,
            @NotEmpty List<Long> roleIds,
            @NotEmpty List<Long> branchIds,
            Long defaultBranchId,
            @Pattern(regexp = "\\d{4,6}", message = "PIN must be 4-6 digits") String pin
    ) {
    }

    public record UpdateUserRequest(
            @NotBlank @Email @Size(max = 150) String email,
            @NotBlank @Size(max = 120) String fullName,
            @Size(max = 30) String phone,
            boolean active,
            @NotEmpty List<Long> roleIds,
            @NotEmpty List<Long> branchIds,
            Long defaultBranchId
    ) {
    }

    public record ResetPasswordRequest(
            @NotBlank @Size(min = 8, max = 100) String newPassword
    ) {
    }

    public record SetUserPinRequest(
            @NotBlank @Pattern(regexp = "\\d{4,6}", message = "PIN must be 4-6 digits") String pin
    ) {
    }

    public record RoleResponse(Long id, String code, String name, String description, boolean systemRole,
                               BigDecimal discountLimitPercent, List<AuthPermission> permissions) {
    }

    public record AuthPermission(Long id, String code, String module, String description) {
    }

    public record CreateRoleRequest(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_]{3,60}", message = "Use letters, numbers or underscore") String code,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 300) String description,
            @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal discountLimitPercent,
            @NotEmpty Set<String> permissionCodes
    ) {
    }

    public record UpdateRoleRequest(
            @NotBlank @Size(max = 120) String name,
            @Size(max = 300) String description,
            @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal discountLimitPercent,
            @NotEmpty Set<String> permissionCodes
    ) {
    }
}
