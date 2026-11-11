# POS Thermal Bill Printing Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Silent 58/80 mm thermal bill printing through a local Windows print agent, with a configurable receipt template, UPI QR, duplicate reprints, and browser-print fallback.

**Architecture:** The React app builds a `ReceiptModel`, renders it to HTML (screen/preview/browser print) and to ESC/POS bytes (agent). A dependency-free PowerShell agent on `127.0.0.1:17890` spools the raw bytes to the selected Windows printer. Business-wide receipt settings live in the database; printer preferences live in `localStorage`.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4, Spring Boot 3.4 / Java 21 / Flyway, `qrcode`, Vitest, Playwright, Windows PowerShell 5.1.

## Global Constraints

- Normal billing must never await a print. Post first, print after.
- Auto-print failures never open a dialog. Manual print falls back to the browser only when nothing reached the agent.
- Reprints print 1 copy and show `*** DUPLICATE ***`.
- Receipts are English-only, CP437-safe, and must never allow text to inject ESC/POS commands.
- The agent binds `127.0.0.1` only, requires `X-Print-Agent-Token` on `/printers` and `/print`, and caps payloads at 512 KB.
- Existing mobile billing layout, browser print, A4 PDF, exchange and offline flows keep working.
- Do not touch untracked Fiverr scripts/images in `frontend/`.

## File Map

- Backend: `domain/Business.java`, `business/BusinessDtos.java`, `business/BusinessService.java`, `auth/AuthDtos.java`, `auth/AuthService.java`, `db/migration/V2__receipt_print_settings.sql`, `BusinessReceiptSettingsTest.java`.
- Print core: `frontend/src/print/{types,printPrefs,printAgent,escpos,receiptModel,ReceiptDocument,PrintProvider,useReceiptPrint}.tsx|ts`.
- Settings UI: `frontend/src/components/PrintSettingsPanel.tsx`, `pages/SettingsPage.tsx`.
- Billing: `pages/PosPage.tsx`, `components/InvoiceDetail.tsx`, `lib/offline.ts`, `lib/types.ts`, `index.css`.
- Agent: `printer-agent/{agent.ps1,install.ps1,uninstall.ps1,README.md}`.
- Tests: `frontend/src/print/*.test.ts`, `frontend/e2e/workspace.spec.ts`.

---

### Task 1: Backend receipt settings

**Files:** entity, DTOs, service, auth DTO/mapping, `V2__receipt_print_settings.sql`, service test.

- [x] Add 13 fields with defaults (`receiptShowCustomer=true`, `Cashier`, `Payment`, `UpiQr`, `Terms`; `Sku/SizeColor/Hsn=false`; `ItemRate/ItemDiscount=true`; `receiptTerms`, `upiId`, `upiPayeeName`).
- [x] Extend `BusinessResponse` + `UpdateBusinessRequest` (UPI regex `^$|...`, sizes 100/150/500).
- [x] Persist and normalize blanks to null; include fields in audit snapshot and response; extend auth `BusinessInfo`.
- [x] Add H2 service unit test covering defaults, persistence and blank normalization.
- [x] `mvn test` and commit.

### Task 2: Print core modules

**Files:** `src/print/types.ts`, `printPrefs.ts`, `printAgent.ts`, `escpos.ts`, `receiptModel.ts` + tests.

- [x] Types: `ReceiptModel`, `ReceiptItem`, `ReceiptSnapshot`, `PrintPrefs`, `AgentPrinter`, `AgentError`.
- [x] Prefs: load/save/version/clamp, defaults `agentUrl=http://127.0.0.1:17890`, `copies=1`, `paperWidth=80`, `fontSize=normal`, `autoPrint=false`.
- [x] Agent client: health 1.5 s, printers 3 s, print 12 s, token header, `sent` flag on errors.
- [x] ESC/POS: widths 48/32/64/42, ASCII/CP437 folding + control stripping, Indian amounts, `Rs.`, item lines, tax split, QR via `GS ( k`, cut `GS V 66 0`, base64 helper.
- [x] Receipt model: invoice/offline/exchange mapping, tax groups, intra/inter state, discounts total, line amount `lineTotal`, UPI URI, terms default, offline snapshot builder, sample preview model.
- [x] Vitest tests for wrapping, folding, totals, tax split, UPI URI, snapshot, prefs.
- [x] `npm run test:unit` and commit.

### Task 3: Provider and receipt UI

**Files:** `ReceiptDocument.tsx`, `PrintProvider.tsx`, `useReceiptPrint.ts`, `main.tsx`, `index.css`.

- [x] `ReceiptDocument` renders `layoutReceipt` lines at paper width, with bold/centre/large styles and QR image.
- [x] `PrintProvider` owns prefs, health, printers, hidden `#print-root`, browser print, agent print policy, test print.
- [x] `useReceiptPrint` binds business/branch/user/prefs into model creation and print calls.
- [x] Print CSS: paper widths, duplicate banner, QR, no fixed page width.
- [x] `npm run build` and commit.

### Task 4: Settings panel

**Files:** `components/PrintSettingsPanel.tsx`, `pages/SettingsPage.tsx`, `lib/types.ts`.

- [x] Extend `BusinessInfo`/`BusinessSettings` with 13 fields and `BusinessForm` + save body.
- [x] Panel: agent status, pairing, refresh/list/select printer, copies, auto-print, test print, content toggles, UPI/terms, Advanced (paper/font/SKU/size/colour/HSN/agent URL/label/show-all), mobile notice.
- [x] Live `ReceiptDocument` preview with current unsaved form values.
- [x] Keep existing shop fields and one save action.
- [x] `npm run build` and commit.

### Task 5: Billing integration

**Files:** `pages/PosPage.tsx`, `components/InvoiceDetail.tsx`, `lib/offline.ts`.

- [x] Store `ReceiptSnapshot` on queued offline sales.
- [x] Replace hand-built receipt with `ReceiptDocument`; add print status row and Print/Retry/Browser print/PDF/Next bill actions.
- [x] Auto-print once per receipt after success, desktop only; manual print fallback.
- [x] Reprint from invoice detail with `duplicate: true`, 1 copy, Retry/Browser fallback; keep PDF download.
- [x] `npm run build` and commit.

### Task 6: Windows print agent

**Files:** `printer-agent/agent.ps1`, `install.ps1`, `uninstall.ps1`, `README.md`.

- [x] HTTP listener with CORS, PNA preflight, host check, token auth, rate limit, body limit.
- [x] `/health`, `/printers` (virtual/label detection), `/print` (raw C# spooler, copies, warnings).
- [x] Installer: copy, config/token, URL ACL, hidden logon task, start + health poll; uninstaller.
- [x] README install/pair/test/troubleshoot. Commit.

### Task 7: Verification

- [x] Backend `mvn test`; frontend `npm run build`; `npm run test:unit`.
- [x] Playwright settings/agent mock tests + existing 6 tests.
- [x] Manual hardware checklist documented; report what needs the real printer.
- [x] Commit tests/docs.

## Interfaces

- `buildReceiptModel(input, options): ReceiptModel`
- `buildOfflineSnapshot(input): ReceiptSnapshot`
- `layoutReceipt(model): ReceiptLine[]`
- `buildEscPos(model): Uint8Array`
- `usePrint(): { prefs, updatePrefs, health, printers, refreshPrinters, connect, testPrint, printReceipt, printBrowser }`
- `printReceipt(model, mode: 'auto' | 'manual'): Promise<PrintOutcome>`
- Agent `POST /print` body `{ printer, jobName, dataBase64, copies }`.

---

## Verification status (2026-11-11)

| Check | Result |
| --- | --- |
| `mvn test` (backend) | 21 tests pass, including `BusinessReceiptSettingsTest` |
| `npm run test:unit` (Vitest) | 34 tests pass (`frontend/src/print/printCore.test.ts`) |
| `npm run build` (tsc + Vite) | passes |
| `npx playwright test` | 9 tests pass (6 existing + 3 new print tests with a mocked agent) |
| Print agent HTTP contract | verified locally on `127.0.0.1`: `/health` ok, `/printers` lists printers and flags virtual/label devices, `/print` rejects unknown printers (404), bad base64 (400), bad copy counts (400), missing token (401) and the CORS/PNA preflight (204) |
| Raw spooler | the Win32 `StartDocPrinter` helper compiles and reaches the spooler; a real job was spooled to a null-device printer end to end |

### Still needs the real hardware

1. Install the vendor ESC/POS driver for the 80 mm thermal printer, then run
   `printer-agent\install.ps1` as administrator on the billing PC.
2. Pair the till in `Settings > Bill print` and press **Test print**.
3. Check the paper: shop header, item lines, totals, the UPI QR (native `GS ( k`),
   the cut (`GS V 66 0`) and the tear-off position.
4. Confirm the bill never reaches the label printer and that the 58 mm setting is
   ignored by an 80 mm-only printer.
5. Post a real bill with auto-print on, then a reprint from the invoice detail
   (must say `*** DUPLICATE ***` and print exactly one copy).
6. Post a bill while the server is unreachable (offline queue) and print it.
7. Flyway `V2__receipt_print_settings.sql` still has to run against the MySQL
   profile; the local and test profiles use `ddl-auto` and never run it.

### Found on the first real print (shop PC)

- The bill printed by the printer `RP 3220 star` (port `USBPOS0`) wrapped at
  **42 characters**, while the driver reports 72 mm (48 characters). Every
  amount was cut in half by the printer (`2,` / `498.00`). Fixed by
  `Characters per line`, a value kept per printer and measured with the
  calibration ruler on the test print.
- `Get-Printer` does not list that ESC/POS roll driver, so the agent offered
  only the virtual printers. The agent now enumerates through
  `Win32_Printer`, which sees every installed printer.