package com.garmentshop.erp.user;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final RoleService roleService;

    @GetMapping("/users")
    @PreAuthorize("hasAuthority('user.view')")
    public List<UserDtos.UserResponse> listUsers() {
        return userService.list();
    }

    @PostMapping("/users")
    @PreAuthorize("hasAuthority('user.manage')")
    public UserDtos.UserResponse createUser(@Valid @RequestBody UserDtos.CreateUserRequest request) {
        return userService.create(request);
    }

    @PutMapping("/users/{id}")
    @PreAuthorize("hasAuthority('user.manage')")
    public UserDtos.UserResponse updateUser(@PathVariable Long id,
                                            @Valid @RequestBody UserDtos.UpdateUserRequest request) {
        return userService.update(id, request);
    }

    @PostMapping("/users/{id}/reset-password")
    @PreAuthorize("hasAuthority('user.manage')")
    public ResponseEntity<Void> resetPassword(@PathVariable Long id,
                                              @Valid @RequestBody UserDtos.ResetPasswordRequest request) {
        userService.resetPassword(id, request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/pin")
    @PreAuthorize("hasAuthority('user.manage')")
    public ResponseEntity<Void> setPin(@PathVariable Long id,
                                       @Valid @RequestBody UserDtos.SetUserPinRequest request) {
        userService.setPin(id, request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/roles")
    @PreAuthorize("hasAuthority('user.view') or hasAuthority('role.manage')")
    public List<UserDtos.RoleResponse> listRoles() {
        return userService.allRoles();
    }

    @PostMapping("/roles")
    @PreAuthorize("hasAuthority('role.manage')")
    public UserDtos.RoleResponse createRole(@Valid @RequestBody UserDtos.CreateRoleRequest request) {
        return roleService.create(request);
    }

    @PutMapping("/roles/{id}")
    @PreAuthorize("hasAuthority('role.manage')")
    public UserDtos.RoleResponse updateRole(@PathVariable Long id,
                                            @Valid @RequestBody UserDtos.UpdateRoleRequest request) {
        return roleService.update(id, request);
    }
}
