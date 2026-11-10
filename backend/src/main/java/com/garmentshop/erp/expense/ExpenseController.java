package com.garmentshop.erp.expense;

import com.garmentshop.erp.common.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/expenses")
@RequiredArgsConstructor
public class ExpenseController {

    private final ExpenseService expenseService;

    @GetMapping("/categories")
    @PreAuthorize("hasAuthority('expense.view') or hasAuthority('expense.manage')")
    public List<ExpenseDtos.CategoryResponse> categories() {
        return expenseService.categories();
    }

    @PostMapping("/categories")
    @PreAuthorize("hasAuthority('expense.manage')")
    public ExpenseDtos.CategoryResponse createCategory(@Valid @RequestBody ExpenseDtos.SaveCategoryRequest request) {
        return expenseService.createCategory(request);
    }

    @PutMapping("/categories/{id}")
    @PreAuthorize("hasAuthority('expense.manage')")
    public ExpenseDtos.CategoryResponse updateCategory(@PathVariable Long id,
                                                       @Valid @RequestBody ExpenseDtos.SaveCategoryRequest request) {
        return expenseService.updateCategory(id, request);
    }

    @GetMapping
    @PreAuthorize("hasAuthority('expense.view') or hasAuthority('expense.manage')")
    public PageResponse<ExpenseDtos.ExpenseResponse> expenses(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return expenseService.expenses(branchId, status, from, to, page, size);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('expense.view') or hasAuthority('expense.manage')")
    public ExpenseDtos.ExpenseResponse expense(@PathVariable Long id) {
        return expenseService.expense(id);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('expense.manage')")
    public ExpenseDtos.ExpenseResponse create(@Valid @RequestBody ExpenseDtos.CreateExpenseRequest request) {
        return expenseService.create(request);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('expense.approve')")
    public ExpenseDtos.ExpenseResponse approve(@PathVariable Long id) {
        return expenseService.approve(id);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('expense.approve')")
    public ExpenseDtos.ExpenseResponse reject(@PathVariable Long id,
                                              @Valid @RequestBody ExpenseDtos.RejectExpenseRequest request) {
        return expenseService.reject(id, request);
    }
}
