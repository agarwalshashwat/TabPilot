import { useState, useEffect } from 'react'
import type { AIProvider, AISettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../background/settings'

const SETTINGS_KEY = 'ai_settings'

const PROVIDER_LABELS: Record<AIProvider, string> = {
  chrome: 'Chrome AI (Gemini Nano)',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini',
  mock: 'Mock System',
}

const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
const ANTHROPIC_MODELS = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5']
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-2.5-pro']

interface Props {
  onClose: () => void
  onSettingsChanged: () => void
}

export function SettingsModal({ onClose, onSettingsChanged }: Props) {
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS)
  const [showKey, setShowKey] = useState<Record<AIProvider, boolean>>({
    chrome: false,
    openai: false,
    anthropic: false,
    gemini: false,
    mock: false,
  })
  const [isSaving, setIsSaving] = useState(false)

  // Load current settings from storage on mount.
  useEffect(() => {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      const stored = result[SETTINGS_KEY] as Partial<AISettings> | undefined
      if (stored) setSettings((prev) => ({ ...prev, ...stored }))
    })
  }, [])

  const update = (patch: Partial<AISettings>) => setSettings((prev) => ({ ...prev, ...patch }))

  const handleSave = async () => {
    setIsSaving(true)
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
    setIsSaving(false)
    onSettingsChanged()
    onClose()
  }

  const toggleShowKey = (provider: AIProvider) =>
    setShowKey((prev) => ({ ...prev, [provider]: !prev[provider] }))

  const providers: AIProvider[] = ['chrome', 'openai', 'anthropic', 'gemini']

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-import settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <span className="modal-title">AI Provider Settings</span>
          <button className="settings-modal-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        {/* Provider selector */}
        <div className="settings-field-group">
          <label className="settings-label">Provider</label>
          <div className="settings-provider-list">
            {providers.map((p) => (
              <label key={p} className="settings-provider-option">
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  checked={settings.provider === p}
                  onChange={() => update({ provider: p })}
                />
                <span>{PROVIDER_LABELS[p]}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Chrome AI — informational note only */}
        {settings.provider === 'chrome' && (
          <p className="settings-note">
            Uses the built-in Gemini Nano model. Requires Chrome 138+ and the model to be
            downloaded. No API key needed.
          </p>
        )}

        {settings.provider !== 'chrome' && (
          <p className="settings-note">
            Prompts and selected page context are sent to {PROVIDER_LABELS[settings.provider]}. Use
            this only on pages where you are comfortable sharing data with that provider.
          </p>
        )}

        {/* OpenAI */}
        {settings.provider === 'openai' && (
          <div className="settings-provider-config">
            <div className="settings-field-group">
              <label className="settings-label">API Key</label>
              <div className="settings-key-row">
                <input
                  className="modal-input"
                  type={showKey.openai ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={settings.openaiKey}
                  onChange={(e) => update({ openaiKey: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="settings-show-key"
                  onClick={() => toggleShowKey('openai')}
                  type="button"
                >
                  {showKey.openai ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="settings-field-group">
              <label className="settings-label">Model</label>
              <select
                className="modal-input settings-select"
                value={settings.openaiModel}
                onChange={(e) => update({ openaiModel: e.target.value })}
              >
                {OPENAI_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Anthropic */}
        {settings.provider === 'anthropic' && (
          <div className="settings-provider-config">
            <div className="settings-field-group">
              <label className="settings-label">API Key</label>
              <div className="settings-key-row">
                <input
                  className="modal-input"
                  type={showKey.anthropic ? 'text' : 'password'}
                  placeholder="sk-ant-..."
                  value={settings.anthropicKey}
                  onChange={(e) => update({ anthropicKey: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="settings-show-key"
                  onClick={() => toggleShowKey('anthropic')}
                  type="button"
                >
                  {showKey.anthropic ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="settings-field-group">
              <label className="settings-label">Model</label>
              <select
                className="modal-input settings-select"
                value={settings.anthropicModel}
                onChange={(e) => update({ anthropicModel: e.target.value })}
              >
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Gemini */}
        {settings.provider === 'gemini' && (
          <div className="settings-provider-config">
            <div className="settings-field-group">
              <label className="settings-label">API Key</label>
              <div className="settings-key-row">
                <input
                  className="modal-input"
                  type={showKey.gemini ? 'text' : 'password'}
                  placeholder="AIza..."
                  value={settings.geminiKey}
                  onChange={(e) => update({ geminiKey: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="settings-show-key"
                  onClick={() => toggleShowKey('gemini')}
                  type="button"
                >
                  {showKey.gemini ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="settings-field-group">
              <label className="settings-label">Model</label>
              <select
                className="modal-input settings-select"
                value={settings.geminiModel}
                onChange={(e) => update({ geminiModel: e.target.value })}
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div
          className="settings-field-group"
          style={{ marginTop: '1rem', borderTop: '1px solid #efeff1', paddingTop: '1rem' }}
        >
          <label className="settings-label">Diagnostics</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              className="btn-ghost"
              style={{ width: '100%', textAlign: 'center', justifyContent: 'center' }}
              onClick={async () => {
                const result = await chrome.storage.local.get('last_trace')
                const trace = result.last_trace
                if (!trace) {
                  alert('No trace found. Run a task first.')
                  return
                }
                const blob = new Blob([JSON.stringify(trace, null, 2)], {
                  type: 'application/json',
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `tabpilot-trace-${Date.now()}.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
              type="button"
            >
              Download Last Trace
            </button>
            <p className="settings-note">
              Share this JSON file with the agent to diagnose failures.
            </p>
          </div>
        </div>

        <div className="modal-buttons">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
