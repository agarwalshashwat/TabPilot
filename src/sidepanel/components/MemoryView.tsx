import { useMemo, useState } from 'react'
import type { AgentMemory } from '../../shared/types'

interface Props {
  memories: AgentMemory[]
  onAdd: (text: string) => void
  onDelete: (id: string) => void
  onTouch: (id: string) => void
}

export function MemoryView({ memories, onAdd, onDelete, onTouch }: Props) {
  const [draft, setDraft] = useState('')

  const sortedMemories = useMemo(
    () => [...memories].sort((a, b) => b.createdAt - a.createdAt),
    [memories],
  )

  const handleAdd = () => {
    const text = draft.trim()
    if (!text) return
    onAdd(text)
    setDraft('')
  }

  return (
    <div className="memory-view">
      <div className="memory-header">
        <span className="memory-count">
          {sortedMemories.length === 0
            ? 'No memories'
            : `${sortedMemories.length} memor${sortedMemories.length === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      <div className="memory-input-wrap">
        <textarea
          className="memory-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a preference or fact to remember across chats..."
          rows={3}
        />
        <div className="memory-input-actions">
          <button className="btn-primary" onClick={handleAdd} disabled={!draft.trim()}>
            Save memory
          </button>
        </div>
      </div>

      {sortedMemories.length === 0 ? (
        <div className="memory-empty">
          <p>No saved memory yet.</p>
          <p>Add items like preferred websites, workflows, or recurring tab habits.</p>
        </div>
      ) : (
        <ul className="memory-list">
          {sortedMemories.map((m) => (
            <li key={m.id} className="memory-card" onMouseEnter={() => onTouch(m.id)}>
              <p className="memory-text">{m.text}</p>
              <button className="btn-delete" onClick={() => onDelete(m.id)} title="Delete memory">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
