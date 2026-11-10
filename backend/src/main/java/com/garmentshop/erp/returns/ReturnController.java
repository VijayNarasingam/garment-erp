package com.garmentshop.erp.returns;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/returns")
@RequiredArgsConstructor
public class ReturnController {

    private final ReturnService returnService;

    @GetMapping
    @PreAuthorize("hasAuthority('pos.return') or hasAuthority('invoice.view')")
    public List<ReturnDtos.ReturnResponse> list(@RequestParam(required = false) Long branchId,
                                                @RequestParam(required = false) String status) {
        return returnService.list(branchId, status);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('pos.return') or hasAuthority('invoice.view')")
    public ReturnDtos.ReturnResponse get(@PathVariable Long id) {
        return returnService.get(id);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('pos.return')")
    public ReturnDtos.ReturnResponse create(@Valid @RequestBody ReturnDtos.CreateReturnRequest request) {
        return returnService.create(request);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('return.approve')")
    public ReturnDtos.ReturnResponse approve(@PathVariable Long id,
                                             @RequestBody(required = false) ReturnDtos.ApproveReturnRequest request) {
        return returnService.approve(id, request);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('return.approve')")
    public ReturnDtos.ReturnResponse reject(@PathVariable Long id,
                                            @Valid @RequestBody ReturnDtos.RejectReturnRequest request) {
        return returnService.reject(id, request);
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("hasAuthority('pos.return')")
    public ReturnDtos.ReturnResponse complete(@PathVariable Long id,
                                              @RequestBody(required = false) ReturnDtos.CompleteReturnRequest request) {
        return returnService.complete(id, request);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('pos.return')")
    public ReturnDtos.ReturnResponse cancel(@PathVariable Long id,
                                            @Valid @RequestBody ReturnDtos.CancelReturnRequest request) {
        return returnService.cancel(id, request);
    }
}
