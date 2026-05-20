import { useRef, useEffect, useState } from 'react'

interface Props {
  defaultName: string
  onSave: (name: string) => void
  onDismiss: () => void
}

export function SaveRoutineModal({ defaultName, onSave, onDismiss }: Props) {
  const [name, setName] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
  }

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="modal-title">Save as Routine</p>
        <input
          ref={inputRef}
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Routine name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') onDismiss()
          }}
        />
        <div className="modal-buttons">
          <button className="btn-ghost" onClick={onDismiss}>
            Dismiss
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={!name.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
