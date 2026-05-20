import type { AISettings } from '../shared/types'

const SETTINGS_KEY = 'ai_settings'

export const DEFAULT_SETTINGS: AISettings = {
  provider: 'chrome',
  openaiKey: '',
  openaiModel: 'gpt-4o',
  anthropicKey: '',
  anthropicModel: 'claude-opus-4-5',
  geminiKey: '',
  geminiModel: 'gemini-2.0-flash',
}

export async function getSettings(): Promise<AISettings> {
  const localResult = await chrome.storage.local.get(SETTINGS_KEY)
  const localStored = localResult[SETTINGS_KEY] as Partial<AISettings> | undefined
  if (localStored) return { ...DEFAULT_SETTINGS, ...localStored }

  // One-time migration fallback for users with existing sync settings.
  const syncResult = await chrome.storage.sync.get(SETTINGS_KEY)
  const syncStored = syncResult[SETTINGS_KEY] as Partial<AISettings> | undefined
  if (!syncStored) return { ...DEFAULT_SETTINGS }

  await chrome.storage.local.set({ [SETTINGS_KEY]: syncStored })
  await chrome.storage.sync.remove(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...syncStored }
}
