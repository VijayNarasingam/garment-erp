package com.garmentshop.erp.business;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/business")
@RequiredArgsConstructor
public class BusinessController {

    private final BusinessService businessService;

    @GetMapping
    public BusinessDtos.BusinessResponse get() {
        return businessService.get();
    }

    @PutMapping
    @PreAuthorize("hasAuthority('settings.manage')")
    public BusinessDtos.BusinessResponse update(@Valid @RequestBody BusinessDtos.UpdateBusinessRequest request) {
        return businessService.update(request);
    }
}
