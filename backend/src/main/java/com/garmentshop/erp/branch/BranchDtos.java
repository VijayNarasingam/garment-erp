package com.garmentshop.erp.branch;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class BranchDtos {

    private BranchDtos() {
    }

    public record BranchResponse(Long id, String code, String name, String address, String city, String state,
                                 String stateCode, String phone, String email, String gstin, String invoicePrefix,
                                 boolean active, boolean primaryBranch) {
    }

    public record SaveBranchRequest(
            @NotBlank @Size(max = 20) String code,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 300) String address,
            @Size(max = 80) String city,
            @Size(max = 80) String state,
            @Size(max = 10) String stateCode,
            @Size(max = 30) String phone,
            @Email @Size(max = 150) String email,
            @Size(max = 20) String gstin,
            @NotBlank @Size(max = 20) String invoicePrefix,
            boolean primaryBranch
    ) {
    }
}
