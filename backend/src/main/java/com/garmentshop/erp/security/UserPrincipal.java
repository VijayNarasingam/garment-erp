package com.garmentshop.erp.security;

import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

@Getter
public class UserPrincipal implements UserDetails {

    private final Long id;
    private final Long businessId;
    private final String username;
    private final String password;
    private final String fullName;
    private final boolean active;
    private final Set<String> permissions;
    private final Set<String> roleCodes;
    private final Set<Long> branchIds;
    private final Long defaultBranchId;
    private final BigDecimal discountLimitPercent;

    public UserPrincipal(Long id, Long businessId, String username, String password, String fullName,
                         boolean active, Set<String> permissions, Set<String> roleCodes,
                         Set<Long> branchIds, Long defaultBranchId, BigDecimal discountLimitPercent) {
        this.id = id;
        this.businessId = businessId;
        this.username = username;
        this.password = password;
        this.fullName = fullName;
        this.active = active;
        this.permissions = permissions == null ? Set.of() : permissions;
        this.roleCodes = roleCodes == null ? Set.of() : roleCodes;
        this.branchIds = branchIds == null ? Set.of() : branchIds;
        this.defaultBranchId = defaultBranchId;
        this.discountLimitPercent = discountLimitPercent == null ? BigDecimal.ZERO : discountLimitPercent;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        Set<GrantedAuthority> authorities = new HashSet<>();
        permissions.forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
        roleCodes.forEach(r -> authorities.add(new SimpleGrantedAuthority("ROLE_" + r)));
        return authorities;
    }

    public boolean hasPermission(String permission) {
        return permissions.contains(permission);
    }

    public boolean isOwner() {
        return roleCodes.contains("SUPER_ADMIN") || roleCodes.contains("BUSINESS_OWNER");
    }

    public boolean canAccessBranch(Long branchId) {
        return isOwner() || branchIds.contains(branchId);
    }

    public String roleSummary() {
        return roleCodes.stream().sorted().collect(Collectors.joining(", "));
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return active;
    }
}
