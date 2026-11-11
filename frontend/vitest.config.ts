import { defineConfig } from 'vitest/config'

// Unit tests are pure TypeScript (no DOM), so they run without the app's Vite plugins.
// Playwright specs live in `e2e/` and are run by `npm run test:e2e` instead.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
