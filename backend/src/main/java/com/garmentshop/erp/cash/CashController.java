package com.garmentshop.erp.cash;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/cash")
@RequiredArgsConstructor
public class CashController {

    private final CashService cashService;

    @GetMapping("/sessions/current")
    @PreAuthorize("hasAuthority('cash.view') or hasAuthority('cash.open')")
    public ResponseEntity<CashDtos.SessionResponse> current(@RequestParam Long branchId) {
        CashDtos.SessionResponse session = cashService.current(branchId);
        return session == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(session);
    }

    @GetMapping("/sessions")
    @PreAuthorize("hasAuthority('cash.view')")
    public List<CashDtos.SessionResponse> sessions(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return cashService.sessions(branchId, from, to);
    }

    @PostMapping("/sessions")
    @PreAuthorize("hasAuthority('cash.open')")
    public CashDtos.SessionResponse open(@Valid @RequestBody CashDtos.OpenSessionRequest request) {
        return cashService.open(request);
    }

    @PostMapping("/sessions/{id}/movements")
    @PreAuthorize("hasAuthority('cash.open')")
    public CashDtos.SessionResponse movement(@PathVariable Long id,
                                             @Valid @RequestBody CashDtos.MovementRequest request) {
        return cashService.movement(id, request);
    }

    @PostMapping("/sessions/{id}/close")
    @PreAuthorize("hasAuthority('cash.close')")
    public CashDtos.SessionResponse close(@PathVariable Long id,
                                          @Valid @RequestBody CashDtos.CloseSessionRequest request) {
        return cashService.close(id, request);
    }

    @PostMapping("/sessions/{id}/approve")
    @PreAuthorize("hasAuthority('cash.approve')")
    public CashDtos.SessionResponse approve(@PathVariable Long id,
                                            @RequestBody(required = false) CashDtos.ApproveSessionRequest request) {
        return cashService.approve(id, request);
    }

    @GetMapping("/daily-closing")
    @PreAuthorize("hasAuthority('cash.view') or hasAuthority('report.view')")
    public CashDtos.DailyClosingResponse dailyClosing(
            @RequestParam Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return cashService.dailyClosing(branchId, date);
    }
}
