package com.garmentshop.erp.security;

import java.util.List;

public final class Permissions {

    public static final String DASHBOARD_VIEW = "dashboard.view";
    public static final String POS_BILL = "pos.bill";
    public static final String POS_DISCOUNT = "pos.discount";
    public static final String POS_HOLD = "pos.hold";
    public static final String POS_RETURN = "pos.return";
    public static final String POS_VOID = "pos.void";
    public static final String INVOICE_VIEW = "invoice.view";
    public static final String INVOICE_AMEND = "invoice.amend";
    public static final String INVOICE_CANCEL = "invoice.cancel";
    public static final String PRODUCT_VIEW = "product.view";
    public static final String PRODUCT_MANAGE = "product.manage";
    public static final String BARCODE_MANAGE = "barcode.manage";
    public static final String INVENTORY_VIEW = "inventory.view";
    public static final String INVENTORY_ADJUST = "inventory.adjust";
    public static final String INVENTORY_TRANSFER = "inventory.transfer";
    public static final String INVENTORY_COSTING = "inventory.costing";
    public static final String NEGATIVE_STOCK_APPROVE = "inventory.negative_stock.approve";
    public static final String PURCHASE_VIEW = "purchase.view";
    public static final String PURCHASE_MANAGE = "purchase.manage";
    public static final String PURCHASE_APPROVE = "purchase.approve";
    public static final String PURCHASE_PAY = "purchase.pay";
    public static final String CUSTOMER_VIEW = "customer.view";
    public static final String CUSTOMER_MANAGE = "customer.manage";
    public static final String SUPPLIER_VIEW = "supplier.view";
    public static final String SUPPLIER_MANAGE = "supplier.manage";
    public static final String EXPENSE_VIEW = "expense.view";
    public static final String EXPENSE_MANAGE = "expense.manage";
    public static final String EXPENSE_APPROVE = "expense.approve";
    public static final String ACCOUNTING_VIEW = "accounting.view";
    public static final String ACCOUNTING_MANAGE = "accounting.manage";
    public static final String ACCOUNTING_CLOSE = "accounting.close";
    public static final String ACCOUNTING_RECONCILE = "accounting.reconcile";
    public static final String REPORT_VIEW = "report.view";
    public static final String REPORT_EXPORT = "report.export";
    public static final String CASH_VIEW = "cash.view";
    public static final String CASH_OPEN = "cash.open";
    public static final String CASH_CLOSE = "cash.close";
    public static final String CASH_APPROVE = "cash.approve";
    public static final String USER_VIEW = "user.view";
    public static final String USER_MANAGE = "user.manage";
    public static final String ROLE_MANAGE = "role.manage";
    public static final String BRANCH_VIEW = "branch.view";
    public static final String BRANCH_MANAGE = "branch.manage";
    public static final String SETTINGS_VIEW = "settings.view";
    public static final String SETTINGS_MANAGE = "settings.manage";
    public static final String TAX_MANAGE = "tax.manage";
    public static final String NOTIFICATION_VIEW = "notification.view";
    public static final String NOTIFICATION_MANAGE = "notification.manage";
    public static final String AUDIT_VIEW = "audit.view";
    public static final String BACKUP_MANAGE = "backup.manage";
    public static final String SYNC_USE = "sync.use";
    public static final String SYNC_MANAGE = "sync.manage";
    public static final String RETURN_APPROVE = "return.approve";
    public static final String DISCOUNT_APPROVE = "discount.approve";
    public static final String STOCK_ADJUST_APPROVE = "stock_adjustment.approve";

    private Permissions() {
    }

    public static List<String> all() {
        return List.of(DASHBOARD_VIEW, POS_BILL, POS_DISCOUNT, POS_HOLD, POS_RETURN, POS_VOID,
                INVOICE_VIEW, INVOICE_AMEND, INVOICE_CANCEL, PRODUCT_VIEW, PRODUCT_MANAGE, BARCODE_MANAGE,
                INVENTORY_VIEW, INVENTORY_ADJUST, INVENTORY_TRANSFER, INVENTORY_COSTING, NEGATIVE_STOCK_APPROVE,
                PURCHASE_VIEW, PURCHASE_MANAGE, PURCHASE_APPROVE, PURCHASE_PAY, CUSTOMER_VIEW, CUSTOMER_MANAGE,
                SUPPLIER_VIEW, SUPPLIER_MANAGE, EXPENSE_VIEW, EXPENSE_MANAGE, EXPENSE_APPROVE, ACCOUNTING_VIEW,
                ACCOUNTING_MANAGE, ACCOUNTING_CLOSE, ACCOUNTING_RECONCILE, REPORT_VIEW, REPORT_EXPORT, CASH_VIEW,
                CASH_OPEN, CASH_CLOSE, CASH_APPROVE, USER_VIEW, USER_MANAGE, ROLE_MANAGE, BRANCH_VIEW,
                BRANCH_MANAGE, SETTINGS_VIEW, SETTINGS_MANAGE, TAX_MANAGE, NOTIFICATION_VIEW,
                NOTIFICATION_MANAGE, AUDIT_VIEW, BACKUP_MANAGE, SYNC_USE, SYNC_MANAGE, RETURN_APPROVE,
                DISCOUNT_APPROVE, STOCK_ADJUST_APPROVE);
    }
}
