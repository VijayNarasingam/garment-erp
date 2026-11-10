package com.garmentshop.erp.bootstrap;

import com.garmentshop.erp.accounting.AccountingService;
import com.garmentshop.erp.common.FinancialYear;
import com.garmentshop.erp.common.Numbering;
import com.garmentshop.erp.config.AppProperties;
import com.garmentshop.erp.domain.Account;
import com.garmentshop.erp.domain.AccountType;
import com.garmentshop.erp.domain.BankAccount;
import com.garmentshop.erp.domain.BankAccountType;
import com.garmentshop.erp.domain.Branch;
import com.garmentshop.erp.domain.Brand;
import com.garmentshop.erp.domain.Business;
import com.garmentshop.erp.domain.Category;
import com.garmentshop.erp.domain.CostingConfig;
import com.garmentshop.erp.domain.Customer;
import com.garmentshop.erp.domain.ExpenseCategory;
import com.garmentshop.erp.domain.FinancialPeriod;
import com.garmentshop.erp.domain.InvoiceSequence;
import com.garmentshop.erp.domain.JournalSource;
import com.garmentshop.erp.domain.NotificationChannel;
import com.garmentshop.erp.domain.NotificationConsent;
import com.garmentshop.erp.domain.NotificationEvent;
import com.garmentshop.erp.domain.NotificationTemplate;
import com.garmentshop.erp.domain.Permission;
import com.garmentshop.erp.domain.PeriodStatus;
import com.garmentshop.erp.domain.Product;
import com.garmentshop.erp.domain.ProductVariant;
import com.garmentshop.erp.domain.Role;
import com.garmentshop.erp.domain.StockMovementType;
import com.garmentshop.erp.domain.Supplier;
import com.garmentshop.erp.domain.TaxCategory;
import com.garmentshop.erp.domain.User;
import com.garmentshop.erp.inventory.StockLedger;
import com.garmentshop.erp.repository.AccountRepository;
import com.garmentshop.erp.repository.BankAccountRepository;
import com.garmentshop.erp.repository.BrandRepository;
import com.garmentshop.erp.repository.BranchRepository;
import com.garmentshop.erp.repository.BusinessRepository;
import com.garmentshop.erp.repository.CategoryRepository;
import com.garmentshop.erp.repository.CostingConfigRepository;
import com.garmentshop.erp.repository.CustomerRepository;
import com.garmentshop.erp.repository.ExpenseCategoryRepository;
import com.garmentshop.erp.repository.FinancialPeriodRepository;
import com.garmentshop.erp.repository.InvoiceSequenceRepository;
import com.garmentshop.erp.repository.NotificationConsentRepository;
import com.garmentshop.erp.repository.NotificationTemplateRepository;
import com.garmentshop.erp.repository.PermissionRepository;
import com.garmentshop.erp.repository.ProductRepository;
import com.garmentshop.erp.repository.ProductVariantRepository;
import com.garmentshop.erp.repository.RoleRepository;
import com.garmentshop.erp.repository.SupplierRepository;
import com.garmentshop.erp.repository.TaxCategoryRepository;
import com.garmentshop.erp.repository.UserRepository;
import com.garmentshop.erp.security.Permissions;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataSeeder implements ApplicationRunner {

    private static final BigDecimal ZERO = BigDecimal.ZERO;

    private final AppProperties appProperties;
    private final PasswordEncoder passwordEncoder;
    private final PermissionRepository permissionRepository;
    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final BusinessRepository businessRepository;
    private final BranchRepository branchRepository;
    private final AccountRepository accountRepository;
    private final TaxCategoryRepository taxCategoryRepository;
    private final CategoryRepository categoryRepository;
    private final BrandRepository brandRepository;
    private final SupplierRepository supplierRepository;
    private final CustomerRepository customerRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final BankAccountRepository bankAccountRepository;
    private final CostingConfigRepository costingConfigRepository;
    private final FinancialPeriodRepository financialPeriodRepository;
    private final InvoiceSequenceRepository invoiceSequenceRepository;
    private final NotificationTemplateRepository notificationTemplateRepository;
    private final NotificationConsentRepository notificationConsentRepository;
    private final ExpenseCategoryRepository expenseCategoryRepository;
    private final StockLedger stockLedger;
    private final AccountingService accountingService;

    @Value("${BOOTSTRAP_BUSINESS_NAME:My Garment Store}")
    private String bootstrapBusinessName;

    @Value("${BOOTSTRAP_ADMIN_USERNAME:owner}")
    private String bootstrapUsername;

    @Value("${BOOTSTRAP_ADMIN_EMAIL:owner@example.com}")
    private String bootstrapEmail;

    @Value("${BOOTSTRAP_ADMIN_NAME:Business Owner}")
    private String bootstrapName;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedPermissions();
        if (businessRepository.count() > 0) {
            return;
        }
        if (appProperties.demoData()) {
            log.info("Seeding demo garment shop data");
            seedDemo();
        } else {
            log.info("Seeding bootstrap business and owner account");
            seedBootstrap();
        }
    }

    // ---------- Permissions ----------

    private void seedPermissions() {
        Map<String, Permission> existing = new HashMap<>();
        permissionRepository.findAll().forEach(p -> existing.put(p.getCode(), p));
        for (String code : Permissions.all()) {
            if (existing.containsKey(code)) {
                continue;
            }
            Permission permission = new Permission();
            permission.setCode(code);
            permission.setModule(code.contains(".") ? code.substring(0, code.indexOf('.')) : "general");
            permission.setDescription(description(code));
            permissionRepository.save(permission);
            existing.put(code, permission);
        }
    }

    private String description(String code) {
        return switch (code) {
            case Permissions.DASHBOARD_VIEW -> "View dashboards and business KPIs";
            case Permissions.POS_BILL -> "Create POS bills and sales invoices";
            case Permissions.POS_DISCOUNT -> "Apply discounts within the role limit";
            case Permissions.POS_HOLD -> "Hold and resume counter bills";
            case Permissions.POS_RETURN -> "Start sales returns from the POS";
            case Permissions.POS_VOID -> "Void an unpaid or same-day bill with a reason";
            case Permissions.INVOICE_VIEW -> "View invoices";
            case Permissions.INVOICE_AMEND -> "Amend a posted invoice through a reversal";
            case Permissions.INVOICE_CANCEL -> "Cancel a posted invoice through a reversal";
            case Permissions.PRODUCT_VIEW -> "View products and variants";
            case Permissions.PRODUCT_MANAGE -> "Create and edit products and variants";
            case Permissions.BARCODE_MANAGE -> "Generate and assign barcodes";
            case Permissions.INVENTORY_VIEW -> "View stock, movements and valuation";
            case Permissions.INVENTORY_ADJUST -> "Post stock adjustments";
            case Permissions.INVENTORY_TRANSFER -> "Transfer stock between branches";
            case Permissions.INVENTORY_COSTING -> "Change the costing method with revaluation";
            case Permissions.NEGATIVE_STOCK_APPROVE -> "Approve billing into negative stock";
            case Permissions.PURCHASE_VIEW -> "View purchase orders and invoices";
            case Permissions.PURCHASE_MANAGE -> "Create purchase orders and receive stock";
            case Permissions.PURCHASE_APPROVE -> "Approve purchase orders";
            case Permissions.PURCHASE_PAY -> "Pay suppliers";
            case Permissions.CUSTOMER_VIEW -> "View customers and ledgers";
            case Permissions.CUSTOMER_MANAGE -> "Create and edit customers";
            case Permissions.SUPPLIER_VIEW -> "View suppliers and ledgers";
            case Permissions.SUPPLIER_MANAGE -> "Create and edit suppliers";
            case Permissions.EXPENSE_VIEW -> "View expenses";
            case Permissions.EXPENSE_MANAGE -> "Record expenses";
            case Permissions.EXPENSE_APPROVE -> "Approve expenses";
            case Permissions.ACCOUNTING_VIEW -> "View the chart of accounts and journals";
            case Permissions.ACCOUNTING_MANAGE -> "Post manual journals";
            case Permissions.ACCOUNTING_CLOSE -> "Open, close and reopen financial periods";
            case Permissions.ACCOUNTING_RECONCILE -> "Reconcile bank and cash accounts";
            case Permissions.REPORT_VIEW -> "View financial and operational reports";
            case Permissions.REPORT_EXPORT -> "Export reports to PDF and Excel";
            case Permissions.CASH_VIEW -> "View cash sessions";
            case Permissions.CASH_OPEN -> "Open a cash session";
            case Permissions.CASH_CLOSE -> "Close a cash session";
            case Permissions.CASH_APPROVE -> "Approve cash discrepancies";
            case Permissions.USER_VIEW -> "View user accounts";
            case Permissions.USER_MANAGE -> "Create and edit user accounts";
            case Permissions.ROLE_MANAGE -> "Create and edit roles and permissions";
            case Permissions.BRANCH_VIEW -> "View branches";
            case Permissions.BRANCH_MANAGE -> "Create and edit branches";
            case Permissions.SETTINGS_VIEW -> "View business settings";
            case Permissions.SETTINGS_MANAGE -> "Change business settings";
            case Permissions.TAX_MANAGE -> "Configure tax categories";
            case Permissions.NOTIFICATION_VIEW -> "View notification templates and logs";
            case Permissions.NOTIFICATION_MANAGE -> "Configure notification templates";
            case Permissions.AUDIT_VIEW -> "View the audit trail";
            case Permissions.BACKUP_MANAGE -> "Run and restore database backups";
            case Permissions.SYNC_USE -> "Use offline sync from a registered device";
            case Permissions.SYNC_MANAGE -> "Manage devices and sync batches";
            case Permissions.RETURN_APPROVE -> "Approve sales returns";
            case Permissions.DISCOUNT_APPROVE -> "Approve discounts above the role limit";
            case Permissions.STOCK_ADJUST_APPROVE -> "Approve stock adjustments";
            default -> "Allows " + code;
        };
    }

    // ---------- Demo data ----------

    private void seedDemo() {
        Business business = createBusiness("Vijay Trendy hub", "Vijay Retail LLP",
                "27AAECA1234B1Z5", true);
        Branch main = createBranch(business, "MAIN", "Vijay Trendy hub - FC Road", "AGM",
                "FC Road, Shivajinagar", "Pune", "Maharashtra", "27", "27AAECA1234B1Z5", true);
        Branch baner = createBranch(business, "BANER", "Vijay Trendy hub - Baner", "AGB",
                "Baner Road, Baner", "Pune", "Maharashtra", "27", "27AAECA1234B1Z5", false);

        Map<String, Account> accounts = createChartOfAccounts(business);
        Map<String, TaxCategory> taxes = createTaxCategories(business);
        Map<String, Role> roles = createRoles(business);
        User owner = createUser(business, "owner", "owner@trendy.demo", "Vijay Owner",
                "Retail@123", "1234", roles.get("BUSINESS_OWNER"), List.of(main, baner), main);

        createBankAccount(business, main, accounts.get(AccountingService.BANK), "Main Current Account");
        createCostingConfig(business, owner);
        createFinancialPeriod(business);
        createInvoiceSequences(business, List.of(main, baner));

        Category shirts = createCategory(business, "Men's Shirts", "Formal and casual shirts");
        Category kurtis = createCategory(business, "Women's Kurtis", "Kurtas, kurtis and suits");
        Category kids = createCategory(business, "Kids Wear", "Everyday kidswear");
        Category denim = createCategory(business, "Denim", "Jeans and denim bottoms");
        Category accessories = createCategory(business, "Accessories", "Belts, socks and add-ons");

        Brand trendy = createBrand(business, "Trendy hub", "House label");
        Brand urban = createBrand(business, "Urban Thread", "Contemporary menswear");
        Brand little = createBrand(business, "Little Loom", "Playful kidswear");

        Supplier deccan = createSupplier(business, "SUP-0001", "Deccan Textiles", "Imran Shaikh",
                "9876540011", "27AABCD1234E1Z2", "Pune", "Maharashtra", "27");
        Supplier mumbai = createSupplier(business, "SUP-0002", "Mumbai Fabric House", "Neha Joshi",
                "9876540012", "27AABCM5678F1Z9", "Mumbai", "Maharashtra", "27");

        Customer walkIn = createCustomer(business, "CUST-0001", "Walk-in Customer", null, null,
                null, null, null, null, ZERO, ZERO);
        Customer priya = createCustomer(business, "CUST-0002", "Priya Sharma", "9876500001",
                "priya.sharma@example.com", "27", "Kothrud, Pune", "Maharashtra", "27",
                BigDecimal.valueOf(5000), BigDecimal.valueOf(2));
        Customer rahul = createCustomer(business, "CUST-0003", "Rahul Verma", "9876500002",
                "rahul.verma@example.com", null, "Baner, Pune", "Maharashtra", "27",
                BigDecimal.valueOf(10000), ZERO);
        Customer ayesha = createCustomer(business, "CUST-0004", "Ayesha Khan", "9876500003",
                null, null, "Camp, Pune", "Maharashtra", "27", ZERO, ZERO);
        Customer nova = createCustomer(business, "CUST-0005", "Nova Tech Solutions", "9876500004",
                "accounts@novatech.example", "27AABCN1234D1Z5", "Hinjewadi, Pune", "Maharashtra", "27",
                BigDecimal.valueOf(50000), BigDecimal.valueOf(5));

        List<ProductSeed> products = List.of(
                new ProductSeed("SH-001", "Men's Oxford Shirt", shirts, urban, deccan, "6205",
                        taxes.get("GST 5%"), 650, 1299, 1599, List.of(
                        variant("White", "M"), variant("White", "L"), variant("White", "XL"),
                        variant("Blue", "M"), variant("Blue", "L"))),
                new ProductSeed("SH-002", "Men's Linen Casual Shirt", shirts, urban, deccan, "6205",
                        taxes.get("GST 5%"), 720, 1499, 1899, List.of(
                        variant("Beige", "M"), variant("Beige", "L"), variant("Olive", "M"),
                        variant("Olive", "L"), variant("Olive", "XL"))),
                new ProductSeed("KU-001", "Women's Anarkali Kurti", kurtis, trendy, mumbai, "6211",
                        taxes.get("GST 5%"), 850, 1699, 2199, List.of(
                        variant("Maroon", "S"), variant("Maroon", "M"), variant("Maroon", "L"),
                        variant("Teal", "M"), variant("Teal", "L"))),
                new ProductSeed("KU-002", "Women's Cotton Straight Kurta", kurtis, trendy, mumbai, "6211",
                        taxes.get("GST 5%"), 480, 999, 1299, List.of(
                        variant("Mustard", "S"), variant("Mustard", "M"), variant("Mustard", "L"),
                        variant("Indigo", "M"), variant("Indigo", "L"))),
                new ProductSeed("KD-001", "Kids Graphic T-Shirt", kids, little, deccan, "6109",
                        taxes.get("GST 5%"), 250, 499, 699, List.of(
                        variant("Red", "2-3Y"), variant("Red", "4-5Y"),
                        variant("Blue", "2-3Y"), variant("Blue", "4-5Y"))),
                new ProductSeed("KD-002", "Kids Denim Dungaree", kids, little, mumbai, "6203",
                        taxes.get("GST 12%"), 550, 1099, 1399, List.of(
                        variant("Blue", "3-4Y"), variant("Blue", "5-6Y"))),
                new ProductSeed("DN-001", "Men's Slim Fit Jeans", denim, urban, deccan, "6203",
                        taxes.get("GST 12%"), 950, 1899, 2499, List.of(
                        variant("Indigo", "30"), variant("Indigo", "32"),
                        variant("Indigo", "34"), variant("Indigo", "36"))),
                new ProductSeed("DN-002", "Women's High Rise Jeans", denim, trendy, mumbai, "6203",
                        taxes.get("GST 12%"), 900, 1799, 2299, List.of(
                        variant("Blue", "26"), variant("Blue", "28"), variant("Blue", "30"))),
                new ProductSeed("AC-001", "Leather Belt", accessories, urban, deccan, "4203",
                        taxes.get("GST 18%"), 300, 699, 899, List.of(
                        variant("Brown", "Free"), variant("Black", "Free"))),
                new ProductSeed("AC-002", "Cotton Socks Pack", accessories, trendy, mumbai, "6115",
                        taxes.get("GST 5%"), 120, 299, 399, List.of(
                        variant("White", "Free"), variant("Black", "Free"))));

        int barcodeCounter = 1;
        Map<Branch, BigDecimal> branchStockValue = new LinkedHashMap<>();
        List<ProductVariant> allVariants = new ArrayList<>();
        for (ProductSeed seed : products) {
            Product product = createProduct(business, seed);
            for (VariantSeed variantSeed : seed.variants()) {
                ProductVariant variant = createVariant(business, product, variantSeed, barcodeCounter++);
                allVariants.add(variant);
            }
        }
        for (ProductVariant variant : allVariants) {
            BigDecimal mainCost = receiveOpening(main, variant, 15);
            branchStockValue.merge(main, mainCost, BigDecimal::add);
            BigDecimal banerCost = receiveOpening(baner, variant, 6);
            branchStockValue.merge(baner, banerCost, BigDecimal::add);
        }
        for (Map.Entry<Branch, BigDecimal> entry : branchStockValue.entrySet()) {
            postOpeningStockJournal(business, entry.getKey(), entry.getValue());
        }

        createExpenseCategories(business, accounts);
        createNotificationTemplates(business);
        createConsents(business, priya, rahul);

        User manager = createUser(business, "manager", "manager@aarohi.demo", "Meera Kulkarni",
                "Retail@123", "1111", roles.get("BRANCH_MANAGER"), List.of(main), main);
        User cashierMain = createUser(business, "cashier", "cashier@aarohi.demo", "Sahil Patil",
                "Retail@123", "2222", roles.get("CASHIER"), List.of(main), main);
        User cashierBaner = createUser(business, "cashier.baner", "cashier.baner@aarohi.demo",
                "Sneha Rao", "Retail@123", "3333", roles.get("CASHIER"), List.of(baner), baner);
        User accountant = createUser(business, "accountant", "accountant@aarohi.demo", "Vikram Desai",
                "Retail@123", "4444", roles.get("ACCOUNTANT"), List.of(main, baner), main);
        User storekeeper = createUser(business, "storekeeper", "storekeeper@aarohi.demo", "Farah Ali",
                "Retail@123", "5555", roles.get("STORE_KEEPER"), List.of(main, baner), main);
        log.info("Demo data ready. Owner login: owner / {} (PIN 1234)", appProperties.seedPassword());
        log.info("Demo users: manager, cashier, cashier.baner, accountant, storekeeper. Branches: {} and {}",
                main.getName(), baner.getName());
        // Keep references alive for clarity in logs and future demo extensions.
        log.debug("Seeded users: {}, {}, {}, {}, {}, {}; customers: {}, {}, {}, {}, {}",
                owner.getUsername(), manager.getUsername(), cashierMain.getUsername(),
                cashierBaner.getUsername(), accountant.getUsername(), storekeeper.getUsername(),
                walkIn.getCode(), priya.getCode(), rahul.getCode(), ayesha.getCode(), nova.getCode());
    }

    private void seedBootstrap() {
        Business business = createBusiness(bootstrapBusinessName, bootstrapBusinessName,
                null, false);
        Branch main = createBranch(business, "MAIN", bootstrapBusinessName + " - Main", "MAIN",
                null, null, null, null, null, true);
        Map<String, Account> accounts = createChartOfAccounts(business);
        createTaxCategories(business);
        Map<String, Role> roles = createRoles(business);
        createUser(business, bootstrapUsername, bootstrapEmail, bootstrapName,
                appProperties.seedPassword(), "1234", roles.get("BUSINESS_OWNER"),
                List.of(main), main);
        createFinancialPeriod(business);
        createInvoiceSequences(business, List.of(main));
        createExpenseCategories(business, accounts);
        createNotificationTemplates(business);
        log.warn("Bootstrap owner created with username '{}'. Change the password immediately.", bootstrapUsername);
    }

    // ---------- Business and branches ----------

    private Business createBusiness(String name, String legalName, String gstin, boolean gstEnabled) {
        Business business = new Business();
        business.setName(name);
        business.setLegalName(legalName);
        business.setCurrency("INR");
        business.setGstEnabled(gstEnabled);
        business.setGstin(gstin);
        business.setStateCode(gstin == null ? null : gstin.substring(0, 2));
        business.setAddress(null);
        business.setPhone(null);
        business.setEmail(null);
        business.setFinancialYearStartMonth(4);
        business.setInvoicePrefix("INV");
        business.setRoundOffEnabled(true);
        business.setDefaultTaxInclusive(false);
        business.setReturnWindowDays(7);
        business.setExchangeWindowDays(15);
        business.setReturnApprovalRequired(true);
        business.setRefundToOriginalMethodOnly(true);
        business.setMaxDiscountPercent(BigDecimal.valueOf(30));
        business.setAllowNegativeStockWithApproval(true);
        business.setTimezone("Asia/Kolkata");
        business.setSettingsJson("{\"receiptFooter\":\"Thank you for shopping with us.\",\"lowStockAlerts\":true}");
        return businessRepository.save(business);
    }

    private Branch createBranch(Business business, String code, String name, String prefix, String address,
                                String city, String state, String stateCode, String gstin, boolean primary) {
        Branch branch = new Branch();
        branch.setBusiness(business);
        branch.setCode(code);
        branch.setName(name);
        branch.setInvoicePrefix(prefix);
        branch.setAddress(address);
        branch.setCity(city);
        branch.setState(state);
        branch.setStateCode(stateCode);
        branch.setGstin(gstin);
        branch.setActive(true);
        branch.setPrimaryBranch(primary);
        return branchRepository.save(branch);
    }

    // ---------- Chart of accounts ----------

    private Map<String, Account> createChartOfAccounts(Business business) {
        Map<String, Account> accounts = new LinkedHashMap<>();
        addAccount(accounts, business, AccountingService.CASH, "Cash in Hand", AccountType.ASSET,
                "CASH", true);
        addAccount(accounts, business, AccountingService.BANK, "Bank Account", AccountType.ASSET,
                "BANK", true);
        addAccount(accounts, business, AccountingService.UPI, "UPI Clearing", AccountType.ASSET,
                "BANK", true);
        addAccount(accounts, business, AccountingService.CARD, "Card Clearing", AccountType.ASSET,
                "BANK", true);
        addAccount(accounts, business, AccountingService.RECEIVABLE, "Accounts Receivable",
                AccountType.ASSET, "CURRENT_ASSET", false);
        addAccount(accounts, business, AccountingService.INVENTORY, "Inventory", AccountType.ASSET,
                "CURRENT_ASSET", false);
        addAccount(accounts, business, AccountingService.INPUT_GST, "Input GST", AccountType.ASSET,
                "TAX", false);
        addAccount(accounts, business, AccountingService.PAYABLE, "Accounts Payable", AccountType.LIABILITY,
                "CURRENT_LIABILITY", false);
        addAccount(accounts, business, AccountingService.OUTPUT_GST, "Output GST", AccountType.LIABILITY,
                "TAX", false);
        addAccount(accounts, business, AccountingService.CUSTOMER_ADVANCE, "Customer Advances",
                AccountType.LIABILITY, "CURRENT_LIABILITY", false);
        addAccount(accounts, business, AccountingService.OWNER_EQUITY, "Owner's Equity", AccountType.EQUITY,
                "EQUITY", false);
        addAccount(accounts, business, AccountingService.RETAINED_EARNINGS, "Retained Earnings",
                AccountType.EQUITY, "EQUITY", false);
        addAccount(accounts, business, AccountingService.OPENING_BALANCE_EQUITY, "Opening Balance Equity",
                AccountType.EQUITY, "EQUITY", false);
        addAccount(accounts, business, AccountingService.SALES, "Sales", AccountType.INCOME, "REVENUE", false);
        addAccount(accounts, business, AccountingService.SALES_RETURNS, "Sales Returns", AccountType.INCOME,
                "REVENUE", false);
        addAccount(accounts, business, AccountingService.DISCOUNTS_ALLOWED, "Discounts Allowed",
                AccountType.INCOME, "REVENUE", false);
        addAccount(accounts, business, AccountingService.OTHER_INCOME, "Other Income", AccountType.INCOME,
                "OTHER_INCOME", false);
        addAccount(accounts, business, AccountingService.ROUND_OFF, "Round Off", AccountType.INCOME,
                "OTHER_INCOME", false);
        addAccount(accounts, business, AccountingService.COGS, "Cost of Goods Sold", AccountType.EXPENSE,
                "COGS", false);
        addAccount(accounts, business, AccountingService.INVENTORY_SHRINKAGE, "Inventory Shrinkage",
                AccountType.EXPENSE, "OPERATING_EXPENSE", false);
        addAccount(accounts, business, AccountingService.CASH_OVER_SHORT, "Cash Over / Short",
                AccountType.EXPENSE, "OPERATING_EXPENSE", false);
        addAccount(accounts, business, "6001", "Rent Expense", AccountType.EXPENSE, "OPERATING_EXPENSE", false);
        addAccount(accounts, business, "6002", "Salaries and Wages", AccountType.EXPENSE,
                "OPERATING_EXPENSE", false);
        addAccount(accounts, business, "6003", "Utilities", AccountType.EXPENSE, "OPERATING_EXPENSE", false);
        addAccount(accounts, business, "6004", "Packaging", AccountType.EXPENSE, "OPERATING_EXPENSE", false);
        addAccount(accounts, business, "6005", "Marketing", AccountType.EXPENSE, "OPERATING_EXPENSE", false);
        addAccount(accounts, business, "6006", "Bank Charges", AccountType.EXPENSE, "OPERATING_EXPENSE", false);
        addAccount(accounts, business, "6007", "Miscellaneous Expense", AccountType.EXPENSE,
                "OPERATING_EXPENSE", false);
        return accounts;
    }

    private void addAccount(Map<String, Account> accounts, Business business, String code, String name,
                            AccountType type, String subtype, boolean cashBank) {
        Account account = new Account();
        account.setBusiness(business);
        account.setCode(code);
        account.setName(name);
        account.setType(type);
        account.setSubtype(subtype);
        account.setSystemAccount(true);
        account.setCashBank(cashBank);
        account.setActive(true);
        accounts.put(code, accountRepository.save(account));
    }

    // ---------- Tax ----------

    private Map<String, TaxCategory> createTaxCategories(Business business) {
        Map<String, TaxCategory> taxes = new LinkedHashMap<>();
        taxes.put("Exempt", tax(business, "Exempt", null, 0, 0, 0, 0, true));
        taxes.put("GST 5%", tax(business, "GST 5%", null, 5, 2.5, 2.5, 5, false));
        taxes.put("GST 12%", tax(business, "GST 12%", null, 12, 6, 6, 12, false));
        taxes.put("GST 18%", tax(business, "GST 18%", null, 18, 9, 9, 18, false));
        taxes.put("GST 28%", tax(business, "GST 28%", null, 28, 14, 14, 28, false));
        return taxes;
    }

    private TaxCategory tax(Business business, String name, String hsn, double gst, double cgst,
                            double sgst, double igst, boolean exempt) {
        TaxCategory tax = new TaxCategory();
        tax.setBusiness(business);
        tax.setName(name);
        tax.setHsnCode(hsn);
        tax.setGstRate(BigDecimal.valueOf(gst));
        tax.setCgstRate(BigDecimal.valueOf(cgst));
        tax.setSgstRate(BigDecimal.valueOf(sgst));
        tax.setIgstRate(BigDecimal.valueOf(igst));
        tax.setExempt(exempt);
        tax.setActive(true);
        return taxCategoryRepository.save(tax);
    }

    // ---------- Roles and users ----------

    private Map<String, Role> createRoles(Business business) {
        Map<String, Permission> all = new HashMap<>();
        permissionRepository.findAll().forEach(p -> all.put(p.getCode(), p));
        Map<String, Role> roles = new LinkedHashMap<>();
        roles.put("SUPER_ADMIN", role(business, "SUPER_ADMIN", "Super Admin",
                "Platform administrator with every permission", all.values(), 100));
        roles.put("BUSINESS_OWNER", role(business, "BUSINESS_OWNER", "Business Owner",
                "Full access to the business", all.values(), 100));
        roles.put("BRANCH_MANAGER", role(business, "BRANCH_MANAGER", "Branch Manager",
                "Runs a branch, its stock, staff and cash", all.values(), 25,
                Permissions.BACKUP_MANAGE, Permissions.ROLE_MANAGE, Permissions.ACCOUNTING_MANAGE,
                Permissions.ACCOUNTING_CLOSE, Permissions.SETTINGS_MANAGE, Permissions.TAX_MANAGE));
        roles.put("CASHIER", role(business, "CASHIER", "Cashier",
                "Bills customers, handles cash and basic returns", all.values(), 10,
                null, Set.of(Permissions.DASHBOARD_VIEW, Permissions.POS_BILL, Permissions.POS_DISCOUNT,
                        Permissions.POS_HOLD, Permissions.POS_RETURN, Permissions.INVOICE_VIEW,
                        Permissions.PRODUCT_VIEW, Permissions.INVENTORY_VIEW, Permissions.CUSTOMER_VIEW,
                        Permissions.CUSTOMER_MANAGE, Permissions.CASH_VIEW, Permissions.CASH_OPEN,
                        Permissions.CASH_CLOSE, Permissions.SYNC_USE, Permissions.NOTIFICATION_VIEW)));
        roles.put("ACCOUNTANT", role(business, "ACCOUNTANT", "Accountant",
                "Keeps the books, tax reports and period close", all.values(), 0,
                null, Set.of(Permissions.DASHBOARD_VIEW, Permissions.INVOICE_VIEW, Permissions.CUSTOMER_VIEW,
                        Permissions.SUPPLIER_VIEW, Permissions.EXPENSE_VIEW, Permissions.EXPENSE_MANAGE,
                        Permissions.EXPENSE_APPROVE, Permissions.ACCOUNTING_VIEW, Permissions.ACCOUNTING_MANAGE,
                        Permissions.ACCOUNTING_CLOSE, Permissions.ACCOUNTING_RECONCILE, Permissions.REPORT_VIEW,
                        Permissions.REPORT_EXPORT, Permissions.PURCHASE_VIEW, Permissions.CASH_VIEW,
                        Permissions.AUDIT_VIEW, Permissions.NOTIFICATION_VIEW)));
        roles.put("STORE_KEEPER", role(business, "STORE_KEEPER", "Store Keeper",
                "Receives, moves and counts stock", all.values(), 0,
                null, Set.of(Permissions.DASHBOARD_VIEW, Permissions.PRODUCT_VIEW, Permissions.PRODUCT_MANAGE,
                        Permissions.BARCODE_MANAGE, Permissions.INVENTORY_VIEW, Permissions.INVENTORY_ADJUST,
                        Permissions.INVENTORY_TRANSFER, Permissions.INVENTORY_COSTING, Permissions.PURCHASE_VIEW,
                        Permissions.PURCHASE_MANAGE, Permissions.CUSTOMER_VIEW, Permissions.SUPPLIER_VIEW,
                        Permissions.SUPPLIER_MANAGE, Permissions.REPORT_VIEW, Permissions.SYNC_USE)));
        roles.put("PURCHASER", role(business, "PURCHASER", "Purchaser",
                "Raises purchase orders and manages suppliers", all.values(), 0,
                null, Set.of(Permissions.DASHBOARD_VIEW, Permissions.PRODUCT_VIEW, Permissions.INVENTORY_VIEW,
                        Permissions.PURCHASE_VIEW, Permissions.PURCHASE_MANAGE, Permissions.PURCHASE_APPROVE,
                        Permissions.PURCHASE_PAY, Permissions.SUPPLIER_VIEW, Permissions.SUPPLIER_MANAGE,
                        Permissions.REPORT_VIEW, Permissions.SYNC_USE)));
        return roles;
    }

    private Role role(Business business, String code, String name, String description,
                      Iterable<Permission> allPermissions, int discountLimit, String... excludedCodes) {
        Set<String> excluded = new HashSet<>(List.of(excludedCodes));
        return role(business, code, name, description, allPermissions, discountLimit, excluded, null);
    }

    private Role role(Business business, String code, String name, String description,
                      Iterable<Permission> allPermissions, int discountLimit, Set<String> excludedCodes,
                      Set<String> allowedCodes) {
        Role role = new Role();
        role.setBusiness(business);
        role.setCode(code);
        role.setName(name);
        role.setDescription(description);
        role.setSystemRole(true);
        role.setDiscountLimitPercent(BigDecimal.valueOf(discountLimit));
        Set<Permission> selected = new HashSet<>();
        for (Permission permission : allPermissions) {
            if (allowedCodes != null) {
                if (allowedCodes.contains(permission.getCode())) {
                    selected.add(permission);
                }
            } else if (excludedCodes == null || !excludedCodes.contains(permission.getCode())) {
                selected.add(permission);
            }
        }
        role.setPermissions(selected);
        return roleRepository.save(role);
    }

    private User createUser(Business business, String username, String email, String fullName,
                            String password, String pin, Role role, List<Branch> branches, Branch defaultBranch) {
        User user = new User();
        user.setBusiness(business);
        user.setUsername(username.toLowerCase(Locale.ENGLISH));
        user.setEmail(email.toLowerCase(Locale.ENGLISH));
        user.setFullName(fullName);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setPinHash(passwordEncoder.encode(pin));
        user.setActive(true);
        user.setRoles(new HashSet<>(Set.of(role)));
        user.setBranches(new HashSet<>(branches));
        user.setDefaultBranch(defaultBranch);
        return userRepository.save(user);
    }

    // ---------- Operations setup ----------

    private void createBankAccount(Business business, Branch branch, Account glAccount, String name) {
        BankAccount bank = new BankAccount();
        bank.setBusiness(business);
        bank.setBranch(branch);
        bank.setName(name);
        bank.setType(BankAccountType.BANK);
        bank.setGlAccount(glAccount);
        bank.setActive(true);
        bankAccountRepository.save(bank);
    }

    private void createCostingConfig(Business business, User owner) {
        CostingConfig config = new CostingConfig();
        config.setBusiness(business);
        config.setMethod(business.getCostingMethod());
        config.setEffectiveFrom(LocalDate.now());
        config.setCreatedBy(owner.getId());
        config.setApprovedBy(owner.getId());
        config.setNote("Initial costing method");
        costingConfigRepository.save(config);
    }

    private void createFinancialPeriod(Business business) {
        FinancialYear year = FinancialYear.current(business.getFinancialYearStartMonth());
        FinancialPeriod period = new FinancialPeriod();
        period.setBusiness(business);
        period.setName("FY " + year.label());
        period.setStartDate(year.start());
        period.setEndDate(year.end());
        period.setStatus(PeriodStatus.OPEN);
        financialPeriodRepository.save(period);
    }

    private void createInvoiceSequences(Business business, List<Branch> branches) {
        FinancialYear year = FinancialYear.current(business.getFinancialYearStartMonth());
        for (Branch branch : branches) {
            InvoiceSequence sequence = new InvoiceSequence();
            sequence.setBranch(branch);
            sequence.setFinancialYear(year.label());
            sequence.setPrefix(branch.getInvoicePrefix());
            sequence.setNextNumber(1);
            invoiceSequenceRepository.save(sequence);
        }
    }

    // ---------- Catalog ----------

    private Category createCategory(Business business, String name, String description) {
        Category category = new Category();
        category.setBusiness(business);
        category.setName(name);
        category.setDescription(description);
        category.setActive(true);
        return categoryRepository.save(category);
    }

    private Brand createBrand(Business business, String name, String description) {
        Brand brand = new Brand();
        brand.setBusiness(business);
        brand.setName(name);
        brand.setDescription(description);
        brand.setActive(true);
        return brandRepository.save(brand);
    }

    private Supplier createSupplier(Business business, String code, String name, String contact,
                                    String phone, String gstin, String city, String state, String stateCode) {
        Supplier supplier = new Supplier();
        supplier.setBusiness(business);
        supplier.setCode(code);
        supplier.setName(name);
        supplier.setContactPerson(contact);
        supplier.setPhone(phone);
        supplier.setGstin(gstin);
        supplier.setCity(city);
        supplier.setState(state);
        supplier.setStateCode(stateCode);
        supplier.setPaymentTermsDays(30);
        supplier.setActive(true);
        return supplierRepository.save(supplier);
    }

    private Customer createCustomer(Business business, String code, String name, String phone, String email,
                                    String gstin, String address, String state, String stateCode,
                                    BigDecimal creditLimit, BigDecimal discountPercent) {
        Customer customer = new Customer();
        customer.setBusiness(business);
        customer.setCode(code);
        customer.setName(name);
        customer.setPhone(phone);
        customer.setEmail(email);
        customer.setGstin(gstin);
        customer.setAddress(address);
        customer.setState(state);
        customer.setStateCode(stateCode);
        customer.setCreditLimit(creditLimit);
        customer.setDiscountPercent(discountPercent);
        customer.setActive(true);
        return customerRepository.save(customer);
    }

    private Product createProduct(Business business, ProductSeed seed) {
        Product product = new Product();
        product.setBusiness(business);
        product.setCode(seed.code());
        product.setName(seed.name());
        product.setCategory(seed.category());
        product.setBrand(seed.brand());
        product.setSupplier(seed.supplier());
        product.setHsnCode(seed.hsn());
        product.setTaxCategory(seed.tax());
        product.setDescription(seed.name() + " - demo catalog item");
        product.setPurchasePrice(BigDecimal.valueOf(seed.purchasePrice()));
        product.setSellingPrice(BigDecimal.valueOf(seed.sellingPrice()));
        product.setMrp(BigDecimal.valueOf(seed.mrp()));
        product.setDefaultDiscountPercent(BigDecimal.ZERO);
        product.setReorderLevel(5);
        product.setActive(true);
        return productRepository.save(product);
    }

    private ProductVariant createVariant(Business business, Product product, VariantSeed seed, int barcodeNumber) {
        ProductVariant variant = new ProductVariant();
        variant.setBusiness(business);
        variant.setProduct(product);
        variant.setSku(sku(product.getCode(), seed.size(), seed.color()));
        variant.setBarcode(Numbering.ean13(String.format("2%011d", barcodeNumber)));
        variant.setBarcodeInternal(true);
        variant.setSize(seed.size());
        variant.setColor(seed.color());
        variant.setPurchasePrice(product.getPurchasePrice());
        variant.setSellingPrice(product.getSellingPrice());
        variant.setMrp(product.getMrp());
        variant.setReorderLevel(product.getReorderLevel());
        variant.setActive(true);
        return variantRepository.save(variant);
    }

    private String sku(String productCode, String size, String color) {
        String cleanSize = size == null ? "" : size.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ENGLISH);
        String cleanColor = color == null ? "" : color.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ENGLISH);
        return productCode + "-" + cleanColor + "-" + cleanSize;
    }

    private BigDecimal receiveOpening(Branch branch, ProductVariant variant, int quantity) {
        StockLedger.StockResult result = stockLedger.receive(branch, variant, quantity,
                variant.getPurchasePrice(), branch.getBusiness().getCostingMethod(),
                StockMovementType.OPENING, LocalDate.now(), "Opening stock",
                "OPENING", branch.getCode(), 0L, "System", null);
        return result.totalCost();
    }

    private void postOpeningStockJournal(Business business, Branch branch, BigDecimal value) {
        if (value.signum() == 0) {
            return;
        }
        accountingService.post(business.getId(), branch, LocalDate.now(),
                "Opening stock - " + branch.getName(), JournalSource.OPENING_BALANCE,
                "OPENING-STOCK-" + branch.getCode(),
                List.of(AccountingService.debit(AccountingService.INVENTORY, value,
                                "Opening stock at cost"),
                        AccountingService.credit(AccountingService.OPENING_BALANCE_EQUITY, value,
                                "Opening stock equity")),
                0L, "System", business.getFinancialYearStartMonth());
    }

    // ---------- Expenses and notifications ----------

    private void createExpenseCategories(Business business, Map<String, Account> accounts) {
        Map<String, String> mapping = new LinkedHashMap<>();
        mapping.put("Rent", "6001");
        mapping.put("Salaries", "6002");
        mapping.put("Utilities", "6003");
        mapping.put("Packaging", "6004");
        mapping.put("Marketing", "6005");
        mapping.put("Bank Charges", "6006");
        mapping.put("Miscellaneous", "6007");
        for (Map.Entry<String, String> entry : mapping.entrySet()) {
            ExpenseCategory category = new ExpenseCategory();
            category.setBusiness(business);
            category.setName(entry.getKey());
            category.setAccount(accounts.get(entry.getValue()));
            category.setActive(true);
            expenseCategoryRepository.save(category);
        }
    }

    private void createNotificationTemplates(Business business) {
        template(business, NotificationEvent.INVOICE_CONFIRMATION, NotificationChannel.WHATSAPP,
                "Invoice {{invoiceNo}}",
                "Hi {{customerName}}, thank you for shopping with {{businessName}}. Invoice {{invoiceNo}} for {{total}} is ready.");
        template(business, NotificationEvent.PAYMENT_CONFIRMATION, NotificationChannel.WHATSAPP,
                "Payment received",
                "Hi {{customerName}}, we received {{amount}} against invoice {{invoiceNo}}. Thank you.");
        template(business, NotificationEvent.PAYMENT_REMINDER, NotificationChannel.SMS,
                "Payment reminder",
                "Dear {{customerName}}, invoice {{invoiceNo}} has {{balance}} pending. Please pay at your convenience.");
        template(business, NotificationEvent.LOW_STOCK, NotificationChannel.EMAIL,
                "Low stock alert: {{productName}}",
                "{{productName}} ({{sku}}) is down to {{quantity}} units at {{branchName}}. Reorder level is {{reorderLevel}}.");
    }

    private void template(Business business, NotificationEvent event, NotificationChannel channel,
                          String subject, String body) {
        NotificationTemplate template = new NotificationTemplate();
        template.setBusinessId(business.getId());
        template.setEventType(event);
        template.setChannel(channel);
        template.setSubject(subject);
        template.setBody(body);
        template.setActive(true);
        notificationTemplateRepository.save(template);
    }

    private void createConsents(Business business, Customer priya, Customer rahul) {
        consent(business, priya, NotificationChannel.WHATSAPP, true);
        consent(business, priya, NotificationChannel.EMAIL, true);
        consent(business, rahul, NotificationChannel.WHATSAPP, false);
    }

    private void consent(Business business, Customer customer, NotificationChannel channel, boolean optedIn) {
        NotificationConsent consent = new NotificationConsent();
        consent.setBusinessId(business.getId());
        consent.setCustomerId(customer.getId());
        consent.setChannel(channel);
        consent.setOptedIn(optedIn);
        consent.setConsentedAt(optedIn ? Instant.now() : null);
        consent.setNotes(optedIn ? "Demo consent recorded during seeding" : "Demo opt-out");
        notificationConsentRepository.save(consent);
    }

    // ---------- Seed value objects ----------

    private record VariantSeed(String color, String size) {
    }

    private VariantSeed variant(String color, String size) {
        return new VariantSeed(color, size);
    }

    private record ProductSeed(String code, String name, Category category, Brand brand, Supplier supplier,
                               String hsn, TaxCategory tax, int purchasePrice, int sellingPrice, int mrp,
                               List<VariantSeed> variants) {
    }
}
