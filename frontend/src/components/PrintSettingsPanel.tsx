import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  PlugZap,
  Printer,
  RefreshCw,
  Smartphone
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/toast'
import { Badge, Button, Field, Input, SectionCard, Select, Textarea } from '../components/ui'
import { ReceiptDocument } from '../print/ReceiptDocument'
import { usePrint } from '../print/PrintProvider'
import { buildPreviewModel } from '../print/receiptModel'
import { COLUMN_PRESETS, QR_SIZE_PRESETS, columnsForPrinter } from '../print/printPrefs'
import { columnsFor } from '../print/escpos'
import type { PaperWidth, FontSize } from '../print/types'

/** The receipt fields the panel reads from the settings form. */
export interface ReceiptFormValues {
  name: string
  address: string
  phone: string
  gstEnabled: boolean
  gstin: string
  stateCode: string
  thankYouNote: string
  invoicePrefix: string
  returnWindowDays: string
  exchangeWindowDays: string
  receiptShowCustomer: boolean
  receiptShowCashier: boolean
  receiptShowPayment: boolean
  receiptShowUpiQr: boolean
  receiptShowTerms: boolean
  receiptShowSku: boolean
  receiptShowSizeColor: boolean
  receiptShowHsn: boolean
  receiptShowItemRate: boolean
  receiptShowItemDiscount: boolean
  receiptTerms: string
  upiId: string
  upiPayeeName: string
}

interface PrintSettingsPanelProps {
  form: ReceiptFormValues
  onChange: (patch: Partial<ReceiptFormValues>) => void
  canEdit: boolean
  saving: boolean
  onSave: () => void
}

const ESSENTIAL_TOGGLES: { key: keyof ReceiptFormValues; label: string; hint: string }[] = [
  { key: 'receiptShowCustomer', label: 'Customer name and phone', hint: 'Shown under the bill number' },
  { key: 'receiptShowCashier', label: 'Billed by (cashier)', hint: 'Who posted the bill' },
  { key: 'receiptShowPayment', label: 'Payment and change', hint: 'Paid, balance and change rows' },
  { key: 'receiptShowUpiQr', label: 'UPI QR code', hint: 'Dynamic QR for the bill amount' },
  { key: 'receiptShowTerms', label: 'Return and exchange terms', hint: 'Closes every bill' },
  { key: 'receiptShowItemRate', label: 'Item rate on each line', hint: 'Quantity x rate' },
  { key: 'receiptShowItemDiscount', label: 'Line discount on each item', hint: 'Only when a discount exists' }
]

const ADVANCED_TOGGLES: { key: keyof ReceiptFormValues; label: string; hint: string }[] = [
  { key: 'receiptShowSku', label: 'SKU code', hint: 'Under the product name' },
  { key: 'receiptShowSizeColor', label: 'Size and colour', hint: 'Under the product name' },
  { key: 'receiptShowHsn', label: 'HSN code', hint: 'GST bill item detail' }
]

export function PrintSettingsPanel({ form, onChange, canEdit, saving, onSave }: PrintSettingsPanelProps) {
  const { business, user, branchId, branches } = useAuth()
  const toast = useToast()
  const print = usePrint()
  const branch = branches.find((entry) => entry.id === branchId) ?? null

  const [tokenDraft, setTokenDraft] = useState(print.prefs.token)
  const [urlDraft, setUrlDraft] = useState(print.prefs.agentUrl)
  const [connecting, setConnecting] = useState(false)
  const [testing, setTesting] = useState(false)

  const preview = useMemo(
    () =>
      buildPreviewModel({
        form,
        business,
        branch,
        user,
        prefs: print.prefs
      }),
    [form, business, branch, user, print.prefs]
  )

  // The test print carries the calibration ruler so the real paper width can be
  // read off the paper instead of guessed from the driver.
  const testModel = useMemo(
    () =>
      buildPreviewModel(
        {
          form,
          business,
          branch,
          user,
          prefs: print.prefs
        },
        { ruler: true }
      ),
    [form, business, branch, user, print.prefs]
  )

  const calibratedColumns = columnsForPrinter(print.prefs, print.prefs.printer)
  const autoColumns = columnsFor({ paperWidth: print.prefs.paperWidth, fontSize: print.prefs.fontSize })

  const selectedPrinter = print.printers.find((printer) => printer.name === print.prefs.printer)
  const driverHint =
    selectedPrinter && selectedPrinter.suggestedColumns
      ? `Driver reports about ${selectedPrinter.suggestedColumns} characters per line (${selectedPrinter.paperWidthMm} mm printable). Trust the test print ruler over this.`
      : null
  const printerWarning = selectedPrinter?.isLabelPrinter
    ? 'This looks like the label or barcode printer. Bills printed there will be wrong.'
    : selectedPrinter?.isVirtual
      ? 'This is a virtual printer (PDF/XPS). Choose the 80 mm thermal printer.'
      : null

  const statusView = (() => {
    switch (print.status) {
      case 'online':
        return {
          tone: 'success' as const,
          label: 'Agent connected',
          detail: print.health ? `Version ${print.health.version} · 127.0.0.1` : 'Ready to print silently'
        }
      case 'offline':
        return {
          tone: 'danger' as const,
          label: 'Agent not running',
          detail: 'Start the print agent on this billing PC, then reconnect.'
        }
      case 'unauthorized':
        return {
          tone: 'warning' as const,
          label: 'Pairing needed',
          detail: 'Paste the pairing token shown by the installer.'
        }
      default:
        return {
          tone: 'neutral' as const,
          label: 'Checking agent…',
          detail: 'Looking for the local print agent.'
        }
    }
  })()

  async function handleConnect() {
    setConnecting(true)
    try {
      const printers = await print.connect(tokenDraft, urlDraft)
      toast.push('Print agent connected', {
        description:
          printers.length > 0
            ? `${printers.length} printer${printers.length === 1 ? '' : 's'} found on this PC.`
            : 'No printers found yet. Install the thermal printer driver, then refresh.',
        tone: 'success'
      })
    } catch (error) {
      toast.push('Could not connect to the print agent', {
        description: error instanceof Error ? error.message : 'Check that the agent is running on this PC.',
        tone: 'error'
      })
    } finally {
      setConnecting(false)
    }
  }

  async function handleRefresh() {
    const printers = await print.refreshPrinters()
    if (printers.length > 0) {
      toast.push('Printer list refreshed', { description: `${printers.length} printer(s) found.`, tone: 'success' })
    } else if (print.lastError) {
      toast.push('Could not read printers', { description: print.lastError, tone: 'error' })
    }
  }

  async function handleTestPrint() {
    setTesting(true)
    try {
      const outcome = await print.testPrint(testModel)
      if (outcome.status === 'sent') {
        toast.push('Test bill sent', {
          description: `${outcome.printer ?? print.prefs.printer} · check the ruler, the QR and the cut.`,
          tone: 'success'
        })
      } else {
        toast.push('Test print failed', {
          description: outcome.warning ?? 'Pair the agent and choose the 80 mm printer first.',
          tone: 'error'
        })
      }
    } finally {
      setTesting(false)
    }
  }

  async function setColumns(value: number) {
    const printer = print.prefs.printer
    if (!printer) return
    try {
      await print.setPrinterColumns(printer, value)
      toast.push(
        value > 0 ? `Paper width set to ${value} characters` : 'Paper width back to automatic',
        {
          description:
            value > 0
              ? 'Saved with the printer, so every browser on this PC prints the same way.'
              : 'The paper width preset is used again.',
          tone: 'success'
        }
      )
    } catch {
      toast.push('Could not save the paper width', {
        description: 'The measurement was kept in this browser only.',
        tone: 'warning'
      })
    }
  }

  const busy = connecting || testing || print.busy

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <SectionCard
          title="Shop details on the receipt"
          description="Printed at the top and bottom of the thermal bill. These also appear on the A4 invoice PDF."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shop name" required hint="Header of every bill" className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(event) => onChange({ name: event.target.value })}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Address" hint="Line by line, printed under the shop name" className="sm:col-span-2">
              <Textarea
                value={form.address}
                onChange={(event) => onChange({ address: event.target.value })}
                disabled={!canEdit}
                className="min-h-16"
              />
            </Field>
            <Field label="Contact number" hint="Phone printed with the address">
              <Input
                value={form.phone}
                onChange={(event) => onChange({ phone: event.target.value })}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Bill number prefix" hint="Used by the server when numbering new bills">
              <Input
                value={form.invoicePrefix}
                onChange={(event) => onChange({ invoicePrefix: event.target.value.toUpperCase() })}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Thank-you note" hint="Closing line at the bottom of every bill" className="sm:col-span-2">
              <Textarea
                value={form.thankYouNote}
                placeholder="Thank you for shopping with us!"
                onChange={(event) => onChange({ thankYouNote: event.target.value })}
                disabled={!canEdit}
                className="min-h-16"
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="This billing PC"
          description="The printer, copies and auto-print choice are saved on this device only. Other counters keep their own."
          action={<Badge tone={statusView.tone} dot>{statusView.label}</Badge>}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line-soft bg-ivory-100/60 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-800">
                  <PlugZap size={13} className="text-terracotta-500" /> Local print agent
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-ink-400">{statusView.detail}</p>
                {print.lastError && print.status !== 'online' && (
                  <p className="mt-1 text-[11px] leading-4 text-brick-600">{print.lastError}</p>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={() => void print.checkAgent()} disabled={busy}>
                <RefreshCw size={13} className={print.status === 'checking' ? 'animate-spin' : undefined} /> Check
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field
                label={print.prefs.token ? 'Replace pairing token' : 'Pairing token'}
                hint="Shown once by the installer on this PC. It is stored only in this browser."
              >
                <Input
                  type="password"
                  value={tokenDraft}
                  autoComplete="off"
                  placeholder="Paste the token from the installer"
                  onChange={(event) => setTokenDraft(event.target.value)}
                  disabled={!canEdit}
                />
              </Field>
              <Button onClick={() => void handleConnect()} loading={connecting} disabled={!canEdit || !tokenDraft.trim()}>
                {print.prefs.token ? 'Re-pair' : 'Connect'}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Bill printer"
                hint={
                  print.printers.length === 0
                    ? 'Connect the agent to list the printers installed on this PC.'
                    : 'Choose the 80 mm thermal printer, never the label printer.'
                }
                className="sm:col-span-2"
              >
                <div className="flex gap-2">
                  <Select
                    value={print.prefs.printer}
                    onChange={(event) => print.updatePrefs({ printer: event.target.value })}
                    disabled={!canEdit || print.printers.length === 0}
                  >
                    <option value="">{print.printers.length === 0 ? 'No printers found' : 'Choose a printer'}</option>
                    {print.printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.name}
                        {printer.isDefault ? ' (Windows default)' : ''}
                        {printer.isLabelPrinter ? ' — label printer' : printer.isVirtual ? ' — virtual' : ''}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleRefresh()}
                    loading={print.printersLoading}
                    disabled={!canEdit || !print.prefs.token}
                    title="Refresh the printer list"
                  >
                    <RefreshCw size={13} />
                  </Button>
                </div>
              </Field>

              <Field label="Copies per bill" hint="1–3. A reprint always prints one copy.">
                <Select
                  value={String(print.prefs.copies)}
                  onChange={(event) => print.updatePrefs({ copies: Number(event.target.value) })}
                  disabled={!canEdit}
                >
                  <option value="1">1 copy</option>
                  <option value="2">2 copies</option>
                  <option value="3">3 copies</option>
                </Select>
              </Field>

              <Field label="Print bills automatically" hint="Off until setup and a test print are done.">
                <label className="flex h-9.5 items-center gap-2 rounded-lg border border-line bg-ivory-50 px-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-terracotta-500"
                    checked={print.prefs.autoPrint}
                    onChange={(event) => print.updatePrefs({ autoPrint: event.target.checked })}
                    disabled={!canEdit || !print.prefs.printer}
                  />
                  <span className="text-[12.5px] text-ink-700">
                    {print.prefs.autoPrint ? 'On — print after every bill' : 'Off — cashier presses Print'}
                  </span>
                </label>
              </Field>
            </div>

            {print.prefs.printer && (
              <Field
                label="Characters per line"
                hint="Press Test print and count the digits on the first ruler line. If it stops early, choose that number here — otherwise the printer cuts amounts in half."
              >
                <Select
                  value={String(calibratedColumns)}
                  onChange={(event) => void setColumns(Number(event.target.value))}
                  disabled={!canEdit}
                >
                  <option value="0">Auto — {autoColumns} columns for {print.prefs.paperWidth} mm</option>
                  {COLUMN_PRESETS.map((value) => (
                    <option key={value} value={value}>
                      {value} columns
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {driverHint && (
              <p className="rounded-lg bg-ivory-100/70 px-3 py-2 text-[10.5px] leading-4 text-ink-500">{driverHint}</p>
            )}

            {print.prefs.printer && calibratedColumns === 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-saffron-200 bg-saffron-100/70 px-3 py-2 text-[11px] leading-4 text-saffron-500">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  Not calibrated yet. Press <strong>Test print</strong> and count the digits on the first ruler line, then
                  set <strong>Characters per line</strong> under Advanced to that number. Until then an amount can be
                  split across two lines.
                </span>
              </p>
            )}

            {printerWarning && (
              <p className="flex items-start gap-2 rounded-lg border border-saffron-200 bg-saffron-100/70 px-3 py-2 text-[11px] leading-4 text-saffron-500">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {printerWarning}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleTestPrint()}
                loading={testing}
                disabled={!canEdit || !print.prefs.printer || busy}
              >
                <Printer size={13} /> Test print
              </Button>
              <p className="text-[11px] leading-4 text-ink-400">
                Prints one sample bill. Confirm the shop name, totals, QR and the paper cut before enabling auto-print.
              </p>
            </div>

            <p className="flex items-start gap-2 rounded-lg bg-ivory-100/70 px-3 py-2 text-[11px] leading-4 text-ink-500 lg:hidden">
              <Smartphone size={13} className="mt-0.5 shrink-0" />
              Silent printing needs the Windows print agent on the billing PC. On a phone or tablet, Print opens the
              browser print dialog instead.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="What appears on the printed bill"
          description="These choices apply to the 58/80 mm receipt. Shop details and the thank-you note also appear on the A4 PDF."
        >
          <div className="space-y-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {ESSENTIAL_TOGGLES.map((toggle) => (
                <label
                  key={toggle.key}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-soft bg-ivory-50 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-terracotta-500"
                    checked={Boolean(form[toggle.key])}
                    onChange={(event) => onChange({ [toggle.key]: event.target.checked })}
                    disabled={!canEdit}
                  />
                  <span>
                    <span className="block text-[12px] font-semibold text-ink-800">{toggle.label}</span>
                    <span className="block text-[10.5px] leading-4 text-ink-400">{toggle.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Shop UPI ID" hint="Used for the dynamic bill QR, for example shop@okaxis">
                <Input
                  value={form.upiId}
                  placeholder="shop@okaxis"
                  onChange={(event) => onChange({ upiId: event.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="UPI payee name" hint="Name shown in the customer's UPI app">
                <Input
                  value={form.upiPayeeName}
                  placeholder={form.name || 'Shop name'}
                  onChange={(event) => onChange({ upiPayeeName: event.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field
                label="Return and exchange terms"
                hint="Leave blank to use the return and exchange windows from Business settings."
                className="sm:col-span-2"
              >
                <Textarea
                  value={form.receiptTerms}
                  placeholder="Exchange within 15 days with this bill. No refund on stitched or washed items."
                  onChange={(event) => onChange({ receiptTerms: event.target.value })}
                  disabled={!canEdit}
                  className="min-h-16"
                />
              </Field>
            </div>

            <details className="group rounded-xl border border-line-soft bg-ivory-50/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-semibold text-ink-700">
                <span className="flex items-center gap-2">
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" /> Advanced
                </span>
                <span className="text-[10.5px] font-normal text-ink-400">Paper, font, extra item details</span>
              </summary>
              <div className="space-y-3 border-t border-line-soft px-3 py-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Paper width" hint="Match the paper roll loaded in the printer.">
                    <Select
                      value={String(print.prefs.paperWidth)}
                      onChange={(event) =>
                        print.updatePrefs({ paperWidth: Number(event.target.value) as PaperWidth })
                      }
                      disabled={!canEdit}
                    >
                      <option value="80">80 mm — 48 columns</option>
                      <option value="58">58 mm — 32 columns</option>
                    </Select>
                  </Field>
                  <Field label="Font size" hint="Small uses the printer's condensed font.">
                    <Select
                      value={print.prefs.fontSize}
                      onChange={(event) => print.updatePrefs({ fontSize: event.target.value as FontSize })}
                      disabled={!canEdit}
                    >
                      <option value="normal">Normal</option>
                      <option value="small">Small</option>
                      <option value="large">Large (double height)</option>
                    </Select>
                  </Field>
                  <Field
                    label="QR code size"
                    hint="Bigger modules scan more easily. 6 is a good middle ground."
                    className="sm:col-span-2"
                  >
                    <Select
                      value={String(print.prefs.qrSize)}
                      onChange={(event) => print.updatePrefs({ qrSize: Number(event.target.value) })}
                      disabled={!canEdit}
                    >
                      {QR_SIZE_PRESETS.map((value) => (
                        <option key={value} value={value}>
                          {value} dots {value <= 4 ? '— small' : value >= 8 ? '— large' : '— medium'}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {ADVANCED_TOGGLES.map((toggle) => (
                    <label
                      key={toggle.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-soft bg-ivory-50 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-terracotta-500"
                        checked={Boolean(form[toggle.key])}
                        onChange={(event) => onChange({ [toggle.key]: event.target.checked })}
                        disabled={!canEdit}
                      />
                      <span>
                        <span className="block text-[12px] font-semibold text-ink-800">{toggle.label}</span>
                        <span className="block text-[10.5px] leading-4 text-ink-400">{toggle.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Label or barcode printer" hint="Remembered so the app can warn if a bill is sent there.">
                    <Select
                      value={print.prefs.labelPrinter}
                      onChange={(event) => print.updatePrefs({ labelPrinter: event.target.value })}
                      disabled={!canEdit || print.printers.length === 0}
                    >
                      <option value="">Not set</option>
                      {print.printers.map((printer) => (
                        <option key={printer.name} value={printer.name}>
                          {printer.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Agent address" hint="Only change this if the agent runs on another port.">
                    <Input
                      value={urlDraft}
                      onChange={(event) => setUrlDraft(event.target.value)}
                      onBlur={() => {
                        if (urlDraft.trim() && tokenDraft.trim() && urlDraft !== print.prefs.agentUrl) {
                          void handleConnect()
                        }
                      }}
                      disabled={!canEdit}
                    />
                  </Field>
                </div>

                <p className="text-[10.5px] leading-4 text-ink-400">
                  A 58 mm setting has no effect on an 80 mm-only printer; that is a hardware limit. The label printer is
                  never used for bills.
                </p>
              </div>
            </details>
          </div>
        </SectionCard>

        {canEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] leading-4 text-ink-400">
              Printer choices save immediately. Bill content needs this save.
            </p>
            <Button loading={saving} onClick={onSave}>
              <CheckCircle2 size={14} /> Save bill print settings
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <SectionCard
          title="Live preview"
          description="Exactly what the thermal printer receives, using sample items."
          bodyClassName="p-3"
        >
          <div className="overflow-x-auto">
            <ReceiptDocument model={preview} preview />
          </div>
        </SectionCard>
        <p className="px-1 text-[10.5px] leading-4 text-ink-400">
          The preview follows unsaved toggles, UPI and terms. Totals are sample values.
        </p>
      </div>
    </div>
  )
}
