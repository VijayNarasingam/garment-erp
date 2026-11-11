# POS Thermal Bill Printing Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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

- [ ] Add 13 fields with defaults (`receiptShowCustomer=true`, `Cashier`, `Payment`, `UpiQr`, `Terms`; `Sku/SizeColor/Hsn=false`; `ItemRate/ItemDiscount=true`; `receiptTerms`, `upiId`, `upiPayeeName`).
- [ ] Extend `BusinessResponse` + `UpdateBusinessRequest` (UPI regex `^$|...`, sizes 100/150/500).
- [ ] Persist and normalize blanks to null; include fields in audit snapshot and response; extend auth `BusinessInfo`.
- [ ] Add H2 service unit test covering defaults, persistence and blank normalization.
- [ ] `mvn test` and commit.

### Task 2: Print core modules

**Files:** `src/print/types.ts`, `printPrefs.ts`, `printAgent.ts`, `escpos.ts`, `receiptModel.ts` + tests.

- [ ] Types: `ReceiptModel`, `ReceiptItem`, `ReceiptSnapshot`, `PrintPrefs`, `AgentPrinter`, `AgentError`.
- [ ] Prefs: load/save/version/clamp, defaults `agentUrl=http://127.0.0.1:17890`, `copies=1`, `paperWidth=80`, `fontSize=normal`, `autoPrint=false`.
- [ ] Agent client: health 1.5 s, printers 3 s, print 12 s, token header, `sent` flag on errors.
- [ ] ESC/POS: widths 48/32/64/42, ASCII/CP437 folding + control stripping, Indian amounts, `Rs.`, item lines, tax split, QR via `GS ( k`, cut `GS V 66 0`, base64 helper.
- [ ] Receipt model: invoice/offline/exchange mapping, tax groups, intra/inter state, discounts total, line amount `lineTotal`, UPI URI, terms default, offline snapshot builder, sample preview model.
- [ ] Vitest tests for wrapping, folding, totals, tax split, UPI URI, snapshot, prefs.
- [ ] `npm run test:unit` and commit.

### Task 3: Provider and receipt UI

**Files:** `ReceiptDocument.tsx`, `PrintProvider.tsx`, `useReceiptPrint.ts`, `main.tsx`, `index.css`.

- [ ] `ReceiptDocument` renders `layoutReceipt` lines at paper width, with bold/centre/large styles and QR image.
- [ ] `PrintProvider` owns prefs, health, printers, hidden `#print-root`, browser print, agent print policy, test print.
- [ ] `useReceiptPrint` binds business/branch/user/prefs into model creation and print calls.
- [ ] Print CSS: paper widths, duplicate banner, QR, no fixed page width.
- [ ] `npm run build` and commit.

### Task 4: Settings panel

**Files:** `components/PrintSettingsPanel.tsx`, `pages/SettingsPage.tsx`, `lib/types.ts`.

- [ ] Extend `BusinessInfo`/`BusinessSettings` with 13 fields and `BusinessForm` + save body.
- [ ] Panel: agent status, pairing, refresh/list/select printer, copies, auto-print, test print, content toggles, UPI/terms, Advanced (paper/font/SKU/size/colour/HSN/agent URL/label/show-all), mobile notice.
- [ ] Live `ReceiptDocument` preview with current unsaved form values.
- [ ] Keep existing shop fields and one save action.
- [ ] `npm run build` and commit.

### Task 5: Billing integration

**Files:** `pages/PosPage.tsx`, `components/InvoiceDetail.tsx`, `lib/offline.ts`.

- [ ] Store `ReceiptSnapshot` on queued offline sales.
- [ ] Replace hand-built receipt with `ReceiptDocument`; add print status row and Print/Retry/Browser print/PDF/Next bill actions.
- [ ] Auto-print once per receipt after success, desktop only; manual print fallback.
- [ ] Reprint from invoice detail with `duplicate: true`, 1 copy, Retry/Browser fallback; keep PDF download.
- [ ] `npm run build` and commit.

### Task 6: Windows print agent

**Files:** `printer-agent/agent.ps1`, `install.ps1`, `uninstall.ps1`, `README.md`.

- [ ] HTTP listener with CORS, PNA preflight, host check, token auth, rate limit, body limit.
- [ ] `/health`, `/printers` (virtual/label detection), `/print` (raw C# spooler, copies, warnings).
- [ ] Installer: copy, config/token, URL ACL, hidden logon task, start + health poll; uninstaller.
- [ ] README install/pair/test/troubleshoot. Commit.

### Task 7: Verification

- [ ] Backend `mvn test`; frontend `npm run build`; `npm run test:unit`.
- [ ] Playwright settings/agent mock tests + existing 6 tests.
- [ ] Manual hardware checklist documented; report what needs the real printer.
- [ ] Commit tests/docs.

## Interfaces

- `buildReceiptModel(input, options): ReceiptModel`
- `buildOfflineSnapshot(input): ReceiptSnapshot`
- `layoutReceipt(model): ReceiptLine[]`
- `buildEscPos(model): Uint8Array`
- `usePrint(): { prefs, updatePrefs, health, printers, refreshPrinters, connect, testPrint, printReceipt, printBrowser }`
- `printReceipt(model, mode: 'auto' | 'manual'): Promise<PrintOutcome>`
- Agent `POST /print` body `{ printer, jobName, dataBase64, copies }`.
