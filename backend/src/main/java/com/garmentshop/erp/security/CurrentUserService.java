package com.garmentshop.erp.security;

import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.repository.BranchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CurrentUserService {

    private final BranchRepository branchRepository;

    public UserPrincipal require() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal principal)) {
            throw ApiException.unauthorized("Authentication is required.");
        }
        return principal;
    }

    public Long userId() {
        return require().getId();
    }

    public Long businessId() {
        Long businessId = require().getBusinessId();
        if (businessId == null) {
            throw ApiException.forbidden("NO_BUSINESS", "This account is not linked to a business.");
        }
        return businessId;
    }

    public void requirePermission(String permission) {
        if (!require().hasPermission(permission)) {
            throw ApiException.forbidden("ACCESS_DENIED", "Missing permission: " + permission);
        }
    }

    public void assertBranch(Long branchId) {
        if (branchId == null) {
            throw ApiException.badRequest("BRANCH_REQUIRED", "A branch is required for this operation.");
        }
        UserPrincipal principal = require();
        Branch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> ApiException.notFound("Branch not found."));
        if (principal.getBusinessId() != null && !principal.getBusinessId().equals(branch.getBusiness().getId())) {
            throw ApiException.forbidden("BRANCH_ACCESS", "You cannot access this branch.");
        }
        if (!principal.canAccessBranch(branchId)) {
            throw ApiException.forbidden("BRANCH_ACCESS", "You are not assigned to this branch.");
        }
    }

    public Branch branch(Long branchId) {
        assertBranch(branchId);
        return branchRepository.findById(branchId).orElseThrow(() -> ApiException.notFound("Branch not found."));
    }

    public List<Long> accessibleBranchIds() {
        UserPrincipal principal = require();
        Long businessId = businessId();
        List<Branch> branches = branchRepository.findByBusinessIdAndActiveTrueOrderByNameAsc(businessId);
        if (principal.isOwner()) {
            return branches.stream().map(Branch::getId).toList();
        }
        return branches.stream().filter(b -> principal.getBranchIds().contains(b.getId())).map(Branch::getId).toList();
    }

    public void assertBusiness(Long businessId) {
        if (businessId != null && !businessId.equals(businessId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "BUSINESS_ACCESS", "You cannot access this business.");
        }
    }
}
