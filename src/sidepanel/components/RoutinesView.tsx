import type { Routine } from '../../shared/types'
import { ImportRoutineModal } from './ImportRoutineModal'
import { useState } from 'react'

interface Props {
  routines: Routine[]
  onRun: (id: string) => void
  onDelete: (id: string) => void
}

function relativeDate(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function RoutinesView({ routines, onRun, onDelete }: Props) {
  const [showImport, setShowImport] = useState(false)

  return (
    <div className="routines-view">
      <div className="routines-header">
        <span className="routines-count">
          {routines.length === 0 ? 'No routines' : `${routines.length} routine${routines.length === 1 ? '' : 's'}`}
        </span>
        <button className="btn-ghost" onClick={() => setShowImport(true)}>
          Import JSON
        </button>
      </div>

      {routines.length === 0 ? (
        <div className="routines-empty">
          <p>Complete a task in Chat, then click</p>
          <p><strong>Save as Routine</strong> to save it here.</p>
        </div>
      ) : (
        <ul className="routines-list">
          {routines.map((r) => (
            <li key={r.id} className="routine-card">
              <div className="routine-info">
                <span className="routine-name">{r.name}</span>
                <span className="routine-desc">{r.description}</span>
                <span className="routine-meta">
                  {r.actions.length} action{r.actions.length === 1 ? '' : 's'} · {relativeDate(r.createdAt)}
                </span>
              </div>
              <div className="routine-actions">
                <button
                  className="btn-run"
                  onClick={() => onRun(r.id)}
                  title="Run this routine"
                >
                  ▶
                </button>
                <button
                  className="btn-delete"
                  onClick={() => {
                    if (confirm(`Delete routine "${r.name}"?`)) onDelete(r.id)
                  }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showImport && (
        <ImportRoutineModal onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}
