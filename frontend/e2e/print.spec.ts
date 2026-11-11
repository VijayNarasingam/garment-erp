import { expect, test, type Page, type Route } from '@playwright/test'

const username = process.env.E2E_USERNAME ?? 'owner'
const password = process.env.E2E_PASSWORD ?? 'Retail@123'

const AGENT_URL = 'http://127.0.0.1:17890'
const PRINTER = 'ERP Thermal 80mm'

interface PrintJob {
  printer: string
  jobName: string
  dataBase64: string
  copies: number
}

/** Pretends the local Windows print agent is installed and healthy. */
async function mockPrintAgent(page: Page) {
  const jobs: PrintJob[] = []
  const columnRequests: { printer: string; columns: number }[] = []

  await page.route(`${AGENT_URL}/**`, async (route: Route) => {
    const request = route.request()
    const url = request.url()

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:5173',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'X-Print-Agent-Token, Content-Type',
          'Access-Control-Allow-Private-Network': 'true'
        }
      })
      return
    }

    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': 'http://localhost:5173' },
        body: JSON.stringify(body)
      })

    if (url.endsWith('/health')) {
      await json({ status: 'ok', version: '1.0.0', uptimeSeconds: 42, queueDepth: 0 })
      return
    }
    if (url.endsWith('/printer-columns')) {
      const payload = request.postDataJSON() as { printer: string; columns: number }
      columnRequests.push(payload)
      await json({ printer: payload.printer, columns: payload.columns })
      return
    }
    if (url.endsWith('/printers')) {
      await json({
        defaultPrinter: PRINTER,
        printers: [
          {
            name: PRINTER,
            driverName: 'XPrinter XP-80C',
            portName: 'USB001',
            status: 'Idle',
            isDefault: true,
            isVirtual: false,
            isLabelPrinter: false,
            paperWidthMm: 0,
            suggestedColumns: 0,
            calibratedColumns: 42
          },
          {
            name: 'Zebra Label Printer',
            driverName: 'ZDesigner',
            portName: 'USB002',
            status: 'Idle',
            isDefault: false,
            isVirtual: false,
            isLabelPrinter: true
          }
        ]
      })
      return
    }
    if (url.endsWith('/print')) {
      const payload = request.postDataJSON() as PrintJob
      jobs.push(payload)
      await json({ jobId: 'job-0001', printer: payload.printer, bytes: 1024, copies: payload.copies })
      return
    }
    await route.fulfill({ status: 404, body: '{}' })
  })

  return { jobs, columnRequests }
}

async function signIn(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /sign in to your counter/i })).toBeVisible()
  await page.locator('input[autocomplete="username"]').fill(username)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.getByRole('button', { name: /enter workspace/i }).click()
  await expect(page.getByText('Signed in successfully')).toBeVisible({ timeout: 20_000 })
}

async function pairTill(page: Page, overrides: Record<string, unknown> = {}) {
  await page.addInitScript(
    (prefs) => {
      window.localStorage.setItem('garment.print.prefs.v1', JSON.stringify(prefs))
    },
    {
      version: 1,
      agentUrl: AGENT_URL,
      token: 'e2e-pairing-token',
      printer: PRINTER,
      labelPrinter: '',
      autoPrint: false,
      copies: 1,
      paperWidth: 80,
      fontSize: 'normal',
      ...overrides
    }
  )
}

async function openBillPrintSettings(page: Page) {
  await signIn(page)
  // Leave the mode chooser for the full workspace, where the settings live.
  await page.getByRole('button', { name: /everything/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings/)
  await page.getByRole('button', { name: 'Bill print' }).click()
}

test.describe('Thermal bill printing', () => {
  test('bill print settings expose the agent, the template and a live preview', async ({ page }) => {
    await mockPrintAgent(page)
    await pairTill(page)
    await openBillPrintSettings(page)

    await expect(page.getByText('This billing PC')).toBeVisible()
    await expect(page.getByText('Local print agent')).toBeVisible()
    await expect(page.getByText('What appears on the printed bill')).toBeVisible()
    await expect(page.getByText('Live preview')).toBeVisible()

    // The template toggles the shop chose are the ones the cashier sees.
    await expect(page.getByLabel('Customer name and phone')).toBeChecked()
    await expect(page.getByLabel('UPI QR code')).toBeChecked()
    await expect(page.getByLabel('SKU code')).not.toBeChecked()

    // The preview is the real receipt document, not a picture of one.
    const preview = page.locator('.receipt-document').first()
    await expect(preview).toBeVisible()
    await expect(preview).toContainText(/BILL|TAX INVOICE/)
    await expect(preview).toContainText('TOTAL')

    // Turning a field off changes the preview straight away.
    await page.getByLabel('Customer name and phone').uncheck()
    await expect(preview).not.toContainText('Customer:')
  })

  test('a paired agent is detected and a test print reaches it', async ({ page }) => {
    const { jobs } = await mockPrintAgent(page)
    await pairTill(page)
    await openBillPrintSettings(page)

    await expect(page.getByText('Agent connected')).toBeVisible({ timeout: 15_000 })

    const printerSelect = page.getByLabel('Bill printer')
    await expect(printerSelect).toHaveValue(PRINTER)

    await page.getByRole('button', { name: 'Test print' }).click()
    await expect(page.getByText('Test bill sent')).toBeVisible({ timeout: 15_000 })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].printer).toBe(PRINTER)
    expect(jobs[0].copies).toBe(1)
    expect(jobs[0].dataBase64.length).toBeGreaterThan(20)
  })

  test('a measured paper width is stored with the printer and used by the bill', async ({ page }) => {
    const { jobs, columnRequests } = await mockPrintAgent(page)
    await pairTill(page)
    await openBillPrintSettings(page)

    await expect(page.getByText('Agent connected')).toBeVisible({ timeout: 15_000 })

    // The agent reports the width that was measured on the paper.
    await expect(page.getByLabel('Characters per line')).toHaveValue('42')
    await expect(page.getByText(/Not calibrated yet/i)).toHaveCount(0)

    // Changing it is remembered by the agent, so other browsers pick it up.
    await page.getByLabel('Characters per line').selectOption('40')
    await expect(page.getByText('Paper width set to 40 characters')).toBeVisible({ timeout: 10_000 })
    expect(columnRequests).toEqual([{ printer: PRINTER, columns: 40 }])

    // The receipt now fits the measured width: no line is longer than 40 characters.
    const preview = page.locator('.receipt-document').first()
    const widths = await preview.evaluate((element) =>
      Array.from(element.querySelectorAll('.receipt-line')).map((line) => (line.textContent ?? '').length)
    )
    expect(Math.max(...widths)).toBeLessThanOrEqual(40)
    expect(jobs).toHaveLength(0)
  })

  test('a posted bill is printed silently through the agent', async ({ page }) => {
    const { jobs } = await mockPrintAgent(page)
    await pairTill(page, { autoPrint: true })
    await signIn(page)
    await page.getByRole('button', { name: /billing/i }).click()
    await expect(page).toHaveURL(/\/billing$/)

    await page.getByRole('button', { name: /left/i }).first().click()

    // The cash tender follows the bill total, so the bill can be charged straight away.
    const charge = page.getByRole('button', { name: /^Charge / })
    await expect(charge).toBeVisible()
    await expect(charge).toContainText(/\d/)
    await charge.click()

    await expect(page.getByRole('heading', { name: 'Invoice posted' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.receipt-document').first()).toBeVisible()

    await expect.poll(() => jobs.length, { timeout: 20_000 }).toBeGreaterThan(0)
    expect(jobs[0].printer).toBe(PRINTER)
    expect(jobs[0].jobName).toMatch(/\d{4}-\d{2}\/\d+/)
  })
})
