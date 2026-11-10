package com.garmentshop.erp.security;

import com.garmentshop.erp.domain.Permission;
import com.garmentshop.erp.domain.Role;
import com.garmentshop.erp.domain.User;
import com.garmentshop.erp.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            chain.doFilter(request, response);
            return;
        }
        String token = header.substring(7);
        try {
            Long userId = jwtService.parseUserId(token);
            if (SecurityContextHolder.getContext().getAuthentication() == null) {
                userRepository.findById(userId).filter(User::isActive).ifPresent(user -> {
                    UserPrincipal principal = toPrincipal(user);
                    UsernamePasswordAuthenticationToken authentication =
                            new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                });
            }
        } catch (Exception ex) {
            log.debug("Rejected JWT: {}", ex.getMessage());
        }
        chain.doFilter(request, response);
    }

    private UserPrincipal toPrincipal(User user) {
        Set<String> permissions = new HashSet<>();
        Set<String> roleCodes = new HashSet<>();
        BigDecimal discountLimit = BigDecimal.ZERO;
        for (Role role : user.getRoles()) {
            roleCodes.add(role.getCode());
            if (role.getDiscountLimitPercent() != null && role.getDiscountLimitPercent().compareTo(discountLimit) > 0) {
                discountLimit = role.getDiscountLimitPercent();
            }
            for (Permission permission : role.getPermissions()) {
                permissions.add(permission.getCode());
            }
        }
        Set<Long> branchIds = new HashSet<>();
        user.getBranches().forEach(b -> branchIds.add(b.getId()));
        Long businessId = user.getBusiness() == null ? null : user.getBusiness().getId();
        Long defaultBranchId = user.getDefaultBranch() == null ? null : user.getDefaultBranch().getId();
        return new UserPrincipal(user.getId(), businessId, user.getUsername(), user.getPasswordHash(),
                user.getFullName(), user.isActive(), permissions, roleCodes, branchIds, defaultBranchId, discountLimit);
    }
}
