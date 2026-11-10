package com.garmentshop.erp.auth;

import com.garmentshop.erp.security.LoginRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final LoginRateLimiter loginRateLimiter;

    @PostMapping("/login")
    public AuthDtos.LoginResponse login(@Valid @RequestBody AuthDtos.LoginRequest request,
                                        HttpServletRequest httpRequest) {
        loginRateLimiter.checkAndRecord(httpRequest);
        return authService.login(request);
    }

    @GetMapping("/me")
    public AuthDtos.LoginResponse me() {
        return authService.me();
    }

    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody AuthDtos.ChangePasswordRequest request) {
        authService.changePassword(request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/pin")
    public ResponseEntity<Void> setPin(@Valid @RequestBody AuthDtos.SetPinRequest request) {
        authService.setPin(request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/permissions")
    @PreAuthorize("hasAuthority('role.manage') or hasAuthority('user.manage')")
    public List<AuthDtos.PermissionInfo> permissions() {
        return authService.permissions();
    }
}
