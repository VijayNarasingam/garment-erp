package com.garmentshop.erp.security;

import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.User;
import com.garmentshop.erp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
@RequiredArgsConstructor
public class ApprovalService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserPrincipalFactory principalFactory;
    private final CurrentUserService currentUserService;

    public User authorize(String approverUsername, String pin, String requiredPermission, Long branchId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw ApiException.badRequest("REASON_REQUIRED", "A reason is required for this approval.");
        }
        if (approverUsername == null || approverUsername.isBlank() || pin == null || pin.isBlank()) {
            throw ApiException.badRequest("APPROVAL_REQUIRED", "Approver username and PIN are required.");
        }
        User approver = userRepository.findByUsernameIgnoreCase(approverUsername.trim())
                .orElseThrow(() -> ApiException.forbidden("APPROVAL_DENIED", "Approval credentials are invalid."));
        if (!approver.isActive() || approver.getPinHash() == null
                || !passwordEncoder.matches(pin, approver.getPinHash())) {
            throw ApiException.forbidden("APPROVAL_DENIED", "Approval credentials are invalid.");
        }
        UserPrincipal principal = principalFactory.create(approver);
        if (!Objects.equals(principal.getBusinessId(), currentUserService.businessId())) {
            throw ApiException.forbidden("APPROVAL_DENIED", "Approver belongs to another business.");
        }
        if (!principal.hasPermission(requiredPermission)) {
            throw ApiException.forbidden("APPROVAL_DENIED", "Approver lacks permission: " + requiredPermission);
        }
        if (branchId != null && !principal.canAccessBranch(branchId)) {
            throw ApiException.forbidden("APPROVAL_DENIED", "Approver is not assigned to this branch.");
        }
        return approver;
    }

    public void verifyPin(User user, String pin) {
        if (user.getPinHash() == null || pin == null || !passwordEncoder.matches(pin, user.getPinHash())) {
            throw ApiException.forbidden("APPROVAL_DENIED", "Approval PIN is invalid.");
        }
    }
}
