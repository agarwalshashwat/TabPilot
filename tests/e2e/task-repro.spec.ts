import { test, expect, chromium } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const extensionPath = resolve(__dirname, '../../dist')

/**
 * A specialized test that runs a prompt through TabPilot and captures logs/traces.
 * Use via: PROMPT="play miami gp" npx playwright test tests/e2e/task-repro.spec.ts
 */
test('Autonomous Task Reproduction', async () => {
  const prompt = process.env.PROMPT
  if (!prompt) {
    console.error('No PROMPT environment variable provided.')
    return
  }

  const baseTmpDir = process.env.TMPDIR || tmpdir()
  const profileDir = mkdtempSync(join(baseTmpDir, 'tabpilot-repro-'))

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })

  // Capture all console logs from all pages/workers
  const logs: string[] = []
  context.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`
    logs.push(text)
    console.log(text)
  })

  let serviceWorker = context.serviceWorkers()[0]
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker')
  }

  const extensionId = new URL(serviceWorker.url()).hostname
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await page.waitForSelector('.chat-input-textarea')

  console.log(`\n>>> Executing prompt: "${prompt}"`)

  const textarea = page.locator('.chat-input-textarea')
  await textarea.fill(prompt)
  await page.keyboard.press('Enter')

  // Wait for the task to finish by watching for 'TASK_COMPLETE' or 'TASK_ERROR'
  // signals. In the UI, this usually means the ThinkingBubble disappears
  // and the input is re-enabled.
  console.log('>>> Waiting for task progression...')

  // Wait up to 2 minutes for complex tasks
  await expect(page.locator('.chat-input-textarea')).toBeEnabled({ timeout: 120_000 })

  console.log('>>> Task execution finished. Extracting trace...')

  // Retrieve the trace from storage
  const trace = await page.evaluate(async () => {
    const c = (globalThis as unknown as { chrome: typeof chrome }).chrome
    const result = await new Promise<unknown>((resolve) => {
      c.storage.local.get('last_trace', (val: Record<string, unknown>) => resolve(val.last_trace))
    })
    return result
  })

  const output = {
    prompt,
    logs,
    trace,
  }

  const outputPath = join(process.cwd(), 'repro-output.json')
  writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`\n>>> Repro output saved to: ${outputPath}`)

  await context.close()
})
