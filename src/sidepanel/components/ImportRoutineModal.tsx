import { useState } from 'react'
import type { SavedAction } from '../../shared/types'

interface Props {
  onClose: () => void
}

/** Minimal structural validation for a SavedAction[]. */
function parseActions(raw: string): SavedAction[] {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array')
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) throw new Error('Each item must be an object')
    if (!item.action || typeof item.action.type !== 'string') {
      throw new Error('Each item must have an "action" with a "type" string')
    }
  }
  return parsed as SavedAction[]
}

export function ImportRoutineModal({ onClose }: Props) {
  const [name, setName] = useState('')
  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleImport = () => {
    setError(null)
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required')
      return
    }
    if (!json.trim()) {
      setError('JSON is required')
      return
    }

    let actions: SavedAction[]
    try {
      actions = parseActions(json)
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`)
      return
    }

    // Post directly via chrome.runtime port — use a one-shot connect since we
    // don't have access to the hook here. The worker will respond with ROUTINES_LIST.
    try {
      const port = chrome.runtime.connect({ name: 'tabpilot' })
      port.postMessage({
        type: 'SAVE_ROUTINE',
        name: trimmedName,
        description: 'Imported routine',
        actions,
      })
      // Give the worker a moment to save, then disconnect.
      setTimeout(() => port.disconnect(), 1000)
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}`)
      return
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-import" onClick={(e) => e.stopPropagation()}>
        <p className="modal-title">Import Routine from JSON</p>
        <input
          className="modal-input"
          placeholder="Routine name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="modal-textarea"
          placeholder={'[\n  { "action": { "type": "openTab", "url": "https://..." } }\n]'}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={8}
        />
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-buttons">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleImport}>
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
