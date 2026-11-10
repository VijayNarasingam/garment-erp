package com.garmentshop.erp.branch;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.repository.BranchRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class BranchService {

    private final BranchRepository branchRepository;
    private final BusinessRepository businessRepository;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<BranchDtos.BranchResponse> list() {
        Long businessId = currentUserService.businessId();
        List<Long> allowed = currentUserService.accessibleBranchIds();
        return branchRepository.findByBusinessIdOrderByNameAsc(businessId).stream()
                .filter(b -> allowed.contains(b.getId()))
                .sorted(Comparator.comparing(Branch::getName))
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public BranchDtos.BranchResponse get(Long id) {
        currentUserService.assertBranch(id);
        return toResponse(branchRepository.findById(id).orElseThrow(() -> ApiException.notFound("Branch not found.")));
    }

    @Transactional
    public BranchDtos.BranchResponse create(BranchDtos.SaveBranchRequest request) {
        Long businessId = currentUserService.businessId();
        if (branchRepository.existsByBusinessIdAndCodeIgnoreCase(businessId, request.code())) {
            throw ApiException.conflict("DUPLICATE_BRANCH", "A branch with this code already exists.");
        }
        Branch branch = new Branch();
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> ApiException.notFound("Business not found."));
        branch.setBusiness(business);
        apply(branch, request);
        if (request.primaryBranch()) {
            clearPrimary(businessId, null);
            branch.setPrimaryBranch(true);
        }
        branchRepository.save(branch);
        auditService.log("BRANCH_CREATED", "BRANCH", branch.getId(), null, snapshot(branch),
                "Branch created", branch.getId(), null);
        return toResponse(branch);
    }

    @Transactional
    public BranchDtos.BranchResponse update(Long id, BranchDtos.SaveBranchRequest request) {
        Long businessId = currentUserService.businessId();
        currentUserService.assertBranch(id);
        Branch branch = branchRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Branch not found."));
        Map<String, Object> before = snapshot(branch);
        if (!branch.getCode().equalsIgnoreCase(request.code())
                && branchRepository.existsByBusinessIdAndCodeIgnoreCase(businessId, request.code())) {
            throw ApiException.conflict("DUPLICATE_BRANCH", "A branch with this code already exists.");
        }
        apply(branch, request);
        if (request.primaryBranch()) {
            clearPrimary(businessId, branch.getId());
            branch.setPrimaryBranch(true);
        }
        branchRepository.save(branch);
        auditService.log("BRANCH_UPDATED", "BRANCH", branch.getId(), before, snapshot(branch),
                "Branch updated", branch.getId(), null);
        return toResponse(branch);
    }

    @Transactional
    public BranchDtos.BranchResponse setActive(Long id, boolean active) {
        Long businessId = currentUserService.businessId();
        currentUserService.assertBranch(id);
        Branch branch = branchRepository.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> ApiException.notFound("Branch not found."));
        if (!active && branch.isPrimaryBranch()) {
            throw ApiException.badRequest("PRIMARY_BRANCH", "The primary branch cannot be deactivated.");
        }
        boolean previous = branch.isActive();
        branch.setActive(active);
        branchRepository.save(branch);
        auditService.log(active ? "BRANCH_ACTIVATED" : "BRANCH_DEACTIVATED", "BRANCH", id,
                Map.of("active", previous), Map.of("active", active),
                "Branch status changed", id, null);
        return toResponse(branch);
    }

    private void apply(Branch branch, BranchDtos.SaveBranchRequest request) {
        branch.setCode(request.code().trim().toUpperCase());
        branch.setName(request.name().trim());
        branch.setAddress(request.address());
        branch.setCity(request.city());
        branch.setState(request.state());
        branch.setStateCode(request.stateCode());
        branch.setPhone(request.phone());
        branch.setEmail(request.email());
        branch.setGstin(request.gstin());
        branch.setInvoicePrefix(request.invoicePrefix().trim().toUpperCase());
    }

    private void clearPrimary(Long businessId, Long exceptId) {
        branchRepository.findByBusinessIdOrderByNameAsc(businessId).stream()
                .filter(b -> b.isPrimaryBranch() && !b.getId().equals(exceptId))
                .forEach(b -> {
                    b.setPrimaryBranch(false);
                    branchRepository.save(b);
                });
    }

    private Map<String, Object> snapshot(Branch b) {
        return Map.of(
                "code", b.getCode(),
                "name", b.getName(),
                "active", b.isActive(),
                "invoicePrefix", b.getInvoicePrefix(),
                "primaryBranch", b.isPrimaryBranch()
        );
    }

    public BranchDtos.BranchResponse toResponse(Branch b) {
        return new BranchDtos.BranchResponse(b.getId(), b.getCode(), b.getName(), b.getAddress(), b.getCity(),
                b.getState(), b.getStateCode(), b.getPhone(), b.getEmail(), b.getGstin(), b.getInvoicePrefix(),
                b.isActive(), b.isPrimaryBranch());
    }
}
