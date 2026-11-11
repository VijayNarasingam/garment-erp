package com.garmentshop.erp.auth;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.Permission;
import com.garmentshop.erp.domain.Role;
import com.garmentshop.erp.domain.User;
import com.garmentshop.erp.repository.BranchRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.PermissionRepository;
import com.garmentshop.erp.repository.UserRepository;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.JwtService;
import com.garmentshop.erp.security.UserPrincipal;
import com.garmentshop.erp.security.UserPrincipalFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final BranchRepository branchRepository;
    private final BusinessRepository businessRepository;
    private final PermissionRepository permissionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final UserPrincipalFactory principalFactory;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    @Transactional
    public AuthDtos.LoginResponse login(AuthDtos.LoginRequest request) {
        User user = userRepository.findByUsernameIgnoreCase(request.username().trim()).orElse(null);
        if (user == null) {
            auditService.record(null, null, null, request.username(), "LOGIN_FAILED", "AUTH", null,
                    null, null, "Unknown username", null, null);
            throw ApiException.unauthorized("Invalid username or password.");
        }
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.LOCKED, "ACCOUNT_LOCKED",
                    "Too many failed attempts. Try again after " + user.getLockedUntil() + ".");
        }
        if (!user.isActive()) {
            throw ApiException.forbidden("ACCOUNT_DISABLED", "This account has been deactivated.");
        }
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            int attempts = user.getFailedLoginAttempts() + 1;
            user.setFailedLoginAttempts(attempts);
            if (attempts >= 5) {
                user.setLockedUntil(Instant.now().plus(15, ChronoUnit.MINUTES));
                user.setFailedLoginAttempts(0);
            }
            userRepository.save(user);
            auditService.record(user.getBusiness() == null ? null : user.getBusiness().getId(), null, user.getId(),
                    user.getUsername(), "LOGIN_FAILED", "AUTH", String.valueOf(user.getId()), null, null,
                    "Invalid password", null, null);
            throw ApiException.unauthorized("Invalid username or password.");
        }
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        UserPrincipal principal = principalFactory.create(user);
        String token = jwtService.generate(principal);
        auditService.record(principal.getBusinessId(), null, principal.getId(), principal.getUsername(),
                "LOGIN", "AUTH", String.valueOf(user.getId()), null, null, null, null, null);
        return new AuthDtos.LoginResponse(token, jwtService.expirationSeconds(), toUserInfo(user, principal),
                toBusinessInfo(user.getBusiness()));
    }

    @Transactional(readOnly = true)
    public AuthDtos.LoginResponse me() {
        UserPrincipal principal = currentUserService.require();
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists."));
        UserPrincipal fresh = principalFactory.create(user);
        return new AuthDtos.LoginResponse(null, 0, toUserInfo(user, fresh), toBusinessInfo(user.getBusiness()));
    }

    @Transactional
    public void changePassword(AuthDtos.ChangePasswordRequest request) {
        User user = userRepository.findById(currentUserService.userId())
                .orElseThrow(() -> ApiException.unauthorized("Account not found."));
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw ApiException.badRequest("INVALID_PASSWORD", "Current password is incorrect.");
        }
        if (request.currentPassword().equals(request.newPassword())) {
            throw ApiException.badRequest("SAME_PASSWORD", "New password must be different from the current password.");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
        auditService.log("PASSWORD_CHANGED", "USER", user.getId(), null, null,
                "User changed own password", null, null);
    }

    @Transactional
    public void setPin(AuthDtos.SetPinRequest request) {
        User user = userRepository.findById(currentUserService.userId())
                .orElseThrow(() -> ApiException.unauthorized("Account not found."));
        user.setPinHash(passwordEncoder.encode(request.pin()));
        userRepository.save(user);
        auditService.log("PIN_CHANGED", "USER", user.getId(), null, null,
                "User set approval PIN", null, null);
    }

    @Transactional(readOnly = true)
    public List<AuthDtos.PermissionInfo> permissions() {
        return permissionRepository.findAll(Sort.by("module", "code")).stream()
                .map(p -> new AuthDtos.PermissionInfo(p.getId(), p.getCode(), p.getModule(), p.getDescription()))
                .toList();
    }

    private AuthDtos.UserInfo toUserInfo(User user, UserPrincipal principal) {
        Set<String> permissions = new HashSet<>();
        Set<String> roles = new HashSet<>();
        for (Role role : user.getRoles()) {
            roles.add(role.getName());
            role.getPermissions().forEach(p -> permissions.add(p.getCode()));
        }
        List<Branch> branches;
        if (principal.isOwner()) {
            branches = branchRepository.findByBusinessIdAndActiveTrueOrderByNameAsc(
                    user.getBusiness() == null ? -1L : user.getBusiness().getId());
        } else {
            branches = user.getBranches().stream()
                    .filter(Branch::isActive)
                    .sorted(Comparator.comparing(Branch::getName))
                    .toList();
        }
        List<AuthDtos.BranchInfo> branchInfos = branches.stream()
                .map(b -> new AuthDtos.BranchInfo(b.getId(), b.getCode(), b.getName(), b.getAddress(),
                        b.getCity(), b.getStateCode(), b.getGstin(), b.getInvoicePrefix(), b.isPrimaryBranch()))
                .toList();
        return new AuthDtos.UserInfo(user.getId(), user.getUsername(), user.getFullName(), user.getEmail(),
                user.getPhone(), roles.stream().sorted().toList(), permissions.stream().sorted().toList(),
                branchInfos, principal.getDefaultBranchId(), principal.getDiscountLimitPercent(),
                user.getBusiness() == null ? null : user.getBusiness().getId());
    }

    private AuthDtos.BusinessInfo toBusinessInfo(Business business) {
        if (business == null) {
            return null;
        }
        return new AuthDtos.BusinessInfo(business.getId(), business.getName(), business.getLegalName(),
                business.getGstin(), business.getStateCode(), business.getAddress(), business.getPhone(),
                business.getEmail(), business.isGstEnabled(), business.getCurrency(), business.getInvoicePrefix(),
                business.isRoundOffEnabled(), business.isDefaultTaxInclusive(), business.getReturnWindowDays(),
                business.getExchangeWindowDays(), business.isReturnApprovalRequired(),
                business.isRefundToOriginalMethodOnly(), business.isAllowNegativeStockWithApproval(),
                business.getCostingMethod().name(), business.getFinancialYearStartMonth(),
                business.getThankYouNote(), business.isReceiptShowCustomer(), business.isReceiptShowCashier(),
                business.isReceiptShowPayment(), business.isReceiptShowUpiQr(), business.isReceiptShowTerms(),
                business.isReceiptShowSku(), business.isReceiptShowSizeColor(), business.isReceiptShowHsn(),
                business.isReceiptShowItemRate(), business.isReceiptShowItemDiscount(),
                business.getReceiptTerms(), business.getUpiId(), business.getUpiPayeeName());
    }

    public void assertSameBusiness(User user, Long businessId) {
        if (!Objects.equals(user.getBusiness() == null ? null : user.getBusiness().getId(), businessId)) {
            throw ApiException.forbidden("BUSINESS_ACCESS", "User is not part of this business.");
        }
    }
}
