import { defineConfig, devices } from '@playwright/test'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const extensionPath = resolve(__dirname, 'dist')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  use: {
    // Playwright launches Chromium with the built extension loaded.
    // Run `npm run build` before running tests.
    ...devices['Desktop Chrome'],
    channel: 'chromium',
    headless: false, // Extensions require a headed browser
    launchOptions: {
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    },
  },
})
