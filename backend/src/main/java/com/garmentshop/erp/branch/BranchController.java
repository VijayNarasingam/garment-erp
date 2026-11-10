package com.garmentshop.erp.branch;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/branches")
@RequiredArgsConstructor
public class BranchController {

    private final BranchService branchService;

    @GetMapping
    @PreAuthorize("hasAuthority('branch.view') or hasAuthority('pos.bill')")
    public List<BranchDtos.BranchResponse> list() {
        return branchService.list();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('branch.view')")
    public BranchDtos.BranchResponse get(@PathVariable Long id) {
        return branchService.get(id);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('branch.manage')")
    public BranchDtos.BranchResponse create(@Valid @RequestBody BranchDtos.SaveBranchRequest request) {
        return branchService.create(request);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('branch.manage')")
    public BranchDtos.BranchResponse update(@PathVariable Long id,
                                            @Valid @RequestBody BranchDtos.SaveBranchRequest request) {
        return branchService.update(id, request);
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAuthority('branch.manage')")
    public BranchDtos.BranchResponse setStatus(@PathVariable Long id, @RequestParam boolean active) {
        return branchService.setActive(id, active);
    }
}
