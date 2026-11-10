package com.garmentshop.erp.security;

import com.garmentshop.erp.domain.User;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Set;

@Component
public class UserPrincipalFactory {

    public UserPrincipal create(User user) {
        Set<String> permissions = new HashSet<>();
        Set<String> roleCodes = new HashSet<>();
        BigDecimal discountLimit = BigDecimal.ZERO;
        for (var role : user.getRoles()) {
            roleCodes.add(role.getCode());
            if (role.getDiscountLimitPercent() != null && role.getDiscountLimitPercent().compareTo(discountLimit) > 0) {
                discountLimit = role.getDiscountLimitPercent();
            }
            for (var permission : role.getPermissions()) {
                permissions.add(permission.getCode());
            }
        }
        Set<Long> branchIds = new HashSet<>();
        user.getBranches().forEach(branch -> branchIds.add(branch.getId()));
        Long businessId = user.getBusiness() == null ? null : user.getBusiness().getId();
        Long defaultBranchId = user.getDefaultBranch() == null ? null : user.getDefaultBranch().getId();
        return new UserPrincipal(user.getId(), businessId, user.getUsername(), user.getPasswordHash(),
                user.getFullName(), user.isActive(), permissions, roleCodes, branchIds, defaultBranchId, discountLimit);
    }
}
