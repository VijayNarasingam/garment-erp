import { expect, test, type Page } from '@playwright/test'

const username = process.env.E2E_USERNAME ?? 'owner'
const password = process.env.E2E_PASSWORD ?? 'Retail@123'

async function signIn(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /sign in to your counter/i })).toBeVisible()
  await page.locator('input[autocomplete="username"]').fill(username)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.getByRole('button', { name: /enter workspace/i }).click()
  await expect(page.getByText('Signed in successfully')).toBeVisible({ timeout: 20_000 })
}

async function openWorkspace(page: Page) {
  await signIn(page)
  await page.getByRole('button', { name: /everything/i }).click()
  await expect(page).toHaveURL(/\/$/)
}

test.describe('Garment ERP workspace', () => {
  test('owner signs in and reaches the mode chooser', async ({ page }) => {
    await signIn(page)

    await expect(page.getByRole('button', { name: /billing/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /everything/i })).toBeVisible()
    await expect(page.getByText(/where to start/i)).toBeVisible()
  })

  test('dashboard loads in the full workspace', async ({ page }) => {
    await openWorkspace(page)

    const main = page.getByRole('main')
    await expect(main.getByText(/today.s sales/i)).toBeVisible()
    await expect(main.getByText('Recent bills', { exact: true })).toBeVisible()
  })

  test('sales and returns routes load', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('link', { name: 'Sales', exact: true }).click()
    await expect(page).toHaveURL(/\/sales$/)
    await expect(page.getByText('Every bill, accounted for', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Returns', exact: true }).click()
    await expect(page).toHaveURL(/\/returns$/)
    await expect(page.getByText('Make it right, on the record', { exact: true })).toBeVisible()
  })

  test('invalid credentials show a clear error', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[autocomplete="username"]').fill('e2e-unknown-user')
    await page.locator('input[autocomplete="current-password"]').fill('DefinitelyWrong!123')
    await page.getByRole('button', { name: /enter workspace/i }).click()

    await expect(page.getByText('Invalid username or password.')).toBeVisible()
  })

  test('billing mode keeps the bill one tap away on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 })
    await signIn(page)
    await page.getByRole('button', { name: /billing/i }).click()
    await expect(page).toHaveURL(/\/billing$/)

    // No horizontal overflow on a narrow counter screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    const bar = page.getByRole('button', { name: 'Open current bill' })
    await expect(bar).toBeVisible()

    const cards = page.getByRole('button', { name: /left/i })
    for (let index = 0; index < 4; index += 1) await cards.nth(index).click()
    await expect(bar).toContainText('4 pcs')

    await bar.click()
    const charge = page.getByRole('button', { name: /^Charge / })
    await charge.scrollIntoViewIfNeeded()
    await expect(charge).toBeInViewport()

    // The sheet itself scrolls to the payment block, and closing it restores page scroll.
    expect(await page.locator('aside').evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Close bill' }).click()
    const pageScroll = await page.evaluate(() => {
      window.scrollTo(0, 500)
      return window.scrollY
    })
    expect(pageScroll).toBeGreaterThan(0)
  })

  test('billing cart scrolls to the charge action on short desktop screens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 })
    await signIn(page)
    await page.getByRole('button', { name: /billing/i }).click()
    await expect(page).toHaveURL(/\/billing$/)

    const cards = page.getByRole('button', { name: /left/i })
    for (let index = 0; index < 5; index += 1) await cards.nth(index).click()

    const charge = page.getByRole('button', { name: /^Charge / })
    await charge.scrollIntoViewIfNeeded()
    await expect(charge).toBeInViewport()
    expect(await page.locator('aside').evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  })
})
