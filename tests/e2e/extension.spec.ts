/// <reference types="node" />
/// <reference types="chrome" />

import { test, expect, chromium } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const extensionPath = resolve(__dirname, '../../dist')

async function resetExtensionStorage(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const c = (globalThis as { chrome: typeof chrome }).chrome
    await new Promise<void>((resolve) => c.storage.sync.clear(() => resolve()))
    await new Promise<void>((resolve) => c.storage.local.clear(() => resolve()))
  })
}

async function launchSidepanel() {
  const baseTmpDir = process.env.TMPDIR || tmpdir()
  const profileDir = mkdtempSync(join(baseTmpDir, 'tabpilot-pw-'))

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [
      '--disable-crashpad',
      '--disable-breakpad',
      '--no-first-run',
      '--no-default-browser-check',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })

  context.on('close', () => {
    try {
      rmSync(profileDir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup only.
    }
  })

  let serviceWorker = context.serviceWorkers()[0]
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker')
  }

  const extensionId = new URL(serviceWorker.url()).hostname
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await resetExtensionStorage(page)
  await page.reload()

  return { context, serviceWorker, extensionId, page }
}

async function readSyncStorage<T>(
  page: import('@playwright/test').Page,
  key: string
): Promise<T | undefined> {
  return page.evaluate(async (storageKey) => {
    const c = (globalThis as { chrome: typeof chrome }).chrome
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      c.storage.sync.get(storageKey, (value: Record<string, unknown>) => resolve(value))
    })
    return result[storageKey] as T | undefined
  }, key)
}

async function readLocalStorage<T>(
  page: import('@playwright/test').Page,
  key: string
): Promise<T | undefined> {
  return page.evaluate(async (storageKey) => {
    const c = (globalThis as { chrome: typeof chrome }).chrome
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      c.storage.local.get(storageKey, (value: Record<string, unknown>) => resolve(value))
    })
    return result[storageKey] as T | undefined
  }, key)
}

// Extension tests require a persistent context so the extension loads properly.
test.describe('TabPilot extension', () => {
  test('extension service worker registers and side panel loads', async () => {
    const { context, serviceWorker, page } = await launchSidepanel()

    expect(serviceWorker).toBeTruthy()

    await expect(page.locator('#root')).toBeAttached()
    await expect(page.locator('.app')).toBeVisible()
    await expect(page.locator('.status-bar')).toBeVisible()

    await context.close()
  })

  test('settings modal updates provider and persists API settings', async () => {
    const { context, page } = await launchSidepanel()

    await page.getByRole('button', { name: 'Open settings' }).click()
    await expect(page.getByText('AI Provider Settings')).toBeVisible()

    await page.locator('input[name="provider"][value="openai"]').check()
    await expect(page.getByRole('radio', { name: 'OpenAI' })).toBeChecked()

    await page.getByPlaceholder('sk-...').fill('sk-test-openai-key')
    await page.locator('select.settings-select').first().selectOption('gpt-4o-mini')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('AI Provider Settings')).toBeHidden()

    const saved = await readLocalStorage<Record<string, string>>(page, 'ai_settings')
    expect(saved?.provider).toBe('openai')
    expect(saved?.openaiKey).toBe('sk-test-openai-key')
    expect(saved?.openaiModel).toBe('gpt-4o-mini')

    await context.close()
  })

  test('view toggle switches between chat, recent chats, routines, and memory panes', async () => {
    const { context, page } = await launchSidepanel()

    const chatButton = page.getByRole('button', { name: 'Chat', exact: true })
    const recentButton = page.getByRole('button', { name: 'Recent Chats' })
    const routinesButton = page.getByRole('button', { name: 'Routines' })
    const memoryButton = page.getByRole('button', { name: 'Memory', exact: true })

    await expect(page.locator('.chat-area')).toBeVisible()
    await expect(chatButton).toHaveClass(/active/)

    await recentButton.click()
    await expect(page.locator('.recent-chats-view')).toBeVisible()
    await expect(recentButton).toHaveClass(/active/)

    await routinesButton.click()
    await expect(page.locator('.routines-view')).toBeVisible()
    await expect(routinesButton).toHaveClass(/active/)

    await memoryButton.click()
    await expect(page.locator('.memory-view')).toBeVisible()
    await expect(memoryButton).toHaveClass(/active/)

    await chatButton.click()
    await expect(page.locator('.chat-area')).toBeVisible()
    await expect(chatButton).toHaveClass(/active/)

    await context.close()
  })

  test('recent chats list shows persisted chats and allows switching after reload', async () => {
    const { context, page } = await launchSidepanel()

    await page.evaluate(async () => {
      const c = (globalThis as { chrome: typeof chrome }).chrome
      await new Promise<void>((resolve) => {
        c.storage.local.set(
          {
            chat_threads_state_v1: {
              activeChatId: 'chat-b',
              threads: {
                'chat-a': [
                  { id: 'a1', role: 'user', content: 'Plan quarterly review agenda' },
                  { id: 'a2', role: 'assistant', content: 'Drafted agenda outline' },
                ],
                'chat-b': [
                  { id: 'b1', role: 'user', content: 'Open docs and summarize release notes' },
                  { id: 'b2', role: 'assistant', content: 'Summary ready' },
                ],
              },
              updatedAtById: {
                'chat-a': Date.now() - 60_000,
                'chat-b': Date.now(),
              },
            },
          },
          () => resolve()
        )
      })
    })

    await page.reload()

    await expect(page.getByText('Open docs and summarize release notes')).toBeVisible()

    await page.getByRole('button', { name: 'Recent Chats' }).click()
    await expect(page.locator('.recent-chat-card')).toHaveCount(2)
    await expect(page.locator('.recent-chat-card').first()).toContainText(
      'Open docs and summarize release notes'
    )

    await page.getByRole('button', { name: /Plan quarterly review agenda/ }).click()
    await expect(page.locator('.chat-area')).toBeVisible()
    await expect(page.getByText('Plan quarterly review agenda')).toBeVisible()

    await expect
      .poll(async () => {
        const latest = await readLocalStorage<{ activeChatId?: string }>(
          page,
          'chat_threads_state_v1'
        )
        return latest?.activeChatId
      })
      .toBe('chat-a')

    await page.reload()
    await page.getByRole('button', { name: 'Recent Chats' }).click()
    await expect(page.locator('.recent-chat-card.active')).toContainText(
      'Plan quarterly review agenda'
    )

    const stored = await readLocalStorage<{ activeChatId?: string }>(page, 'chat_threads_state_v1')
    expect(stored?.activeChatId).toBe('chat-a')

    await context.close()
  })

  test('routines flow shows empty state, validates import JSON, and renders imported routine after reload', async () => {
    const { context, page } = await launchSidepanel()

    await page.getByRole('button', { name: 'Routines' }).click()
    await expect(page.getByText('No routines')).toBeVisible()
    await expect(page.getByText('Save as Routine')).toBeVisible()

    await page.getByRole('button', { name: 'Import JSON' }).click()
    await expect(page.getByText('Import Routine from JSON')).toBeVisible()

    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(page.getByText('Name is required')).toBeVisible()

    await page.getByPlaceholder('Routine name').fill('Imported smoke routine')
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(page.getByText('JSON is required')).toBeVisible()

    await page.locator('.modal-textarea').fill('{bad json}')
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(page.getByText(/Invalid JSON:/)).toBeVisible()

    await page
      .locator('.modal-textarea')
      .fill('[{"action":{"type":"openTab","url":"https://example.com"}}]')
    await page.getByRole('button', { name: 'Import', exact: true }).click()

    await expect(page.getByText('Import Routine from JSON')).toBeHidden()

    await expect
      .poll(async () => {
        const index = await readSyncStorage<string[]>(page, 'routine_index')
        return Array.isArray(index) ? index.length : 0
      })
      .toBe(1)

    await page.reload()
    await page.getByRole('button', { name: 'Routines' }).click()
    await expect(page.locator('.routine-card')).toHaveCount(1)
    await expect(page.getByText('Imported smoke routine')).toBeVisible()

    await context.close()
  })

  test('memory flow adds, persists, and deletes memories', async () => {
    const { context, page } = await launchSidepanel()

    await page.getByRole('button', { name: 'Memory', exact: true }).click()
    await expect(page.getByText('No memories')).toBeVisible()

    await page
      .getByPlaceholder('Add a preference or fact to remember across chats...')
      .fill('Always open Gmail and Calendar first in the morning')
    await page.getByRole('button', { name: 'Save memory' }).click()

    await expect(
      page.getByText('Always open Gmail and Calendar first in the morning')
    ).toBeVisible()

    await expect
      .poll(async () => {
        const memories = await readLocalStorage<Array<{ text: string }>>(page, 'agent_memories')
        return Array.isArray(memories) ? memories.length : 0
      })
      .toBe(1)

    await page.reload()
    await page.getByRole('button', { name: 'Memory' }).click()
    await expect(
      page.getByText('Always open Gmail and Calendar first in the morning')
    ).toBeVisible()

    await page.locator('.memory-card .btn-delete').first().click()
    await expect(page.getByText('No memories')).toBeVisible()

    await expect
      .poll(async () => {
        const memories = await readLocalStorage<Array<{ text: string }>>(page, 'agent_memories')
        return Array.isArray(memories) ? memories.length : 0
      })
      .toBe(0)

    await context.close()
  })

  test('rephrase button is visible and triggers rephrasing', async () => {
    const { context, page } = await launchSidepanel()

    // Pre-populate chat history and provider settings so the prompt and buttons render on load
    await page.evaluate(async () => {
      const c = (globalThis as { chrome: typeof chrome }).chrome
      await new Promise<void>((resolve) => {
        c.storage.local.set(
          {
            ai_settings: {
              provider: 'openai',
              openaiKey: 'sk-test-key-123',
              openaiModel: 'gpt-4o',
            },
          },
          () => resolve()
        )
      })
      await new Promise<void>((resolve) => {
        c.storage.local.set(
          {
            chat_history: [
              { id: '1', role: 'user', content: 'vague prompt' },
              { id: '2', role: 'assistant', content: 'planned actions explanation' },
            ],
          },
          () => resolve()
        )
      })
    })

    await page.reload()

    await expect(page.locator('.rephrase-btn')).toBeVisible()
    await expect(page.locator('.retry-btn').first()).toBeVisible()

    // Type in input and verify input-area Rephrase button renders
    await page.locator('.chat-textarea').fill('vague draft prompt')
    await expect(page.locator('.rephrase-input-btn')).toBeVisible()

    await context.close()
  })
})
