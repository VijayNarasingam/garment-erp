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
})
