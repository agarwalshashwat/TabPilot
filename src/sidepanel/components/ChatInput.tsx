import { useRef, useCallback } from 'react'
import type { AIAvailability } from '../../shared/types'

interface Props {
  onSubmit: (prompt: string) => void
  onCancel: () => void
  disabled: boolean
  availability: AIAvailability | null
  value: string
  onChange: (val: string) => void
  onRephrase: () => void
}

export function ChatInput({
  onSubmit,
  onCancel,
  disabled,
  availability,
  value,
  onChange,
  onRephrase,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
  }, [value, disabled, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
      // Auto-grow
      const el = e.target
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    },
    [onChange]
  )

  const placeholder =
    availability === 'unavailable'
      ? 'Gemini Nano is not supported on this device'
      : availability === 'downloadable'
        ? 'Click the status bar above to download Gemini Nano first'
        : availability === 'downloading'
          ? 'Downloading Gemini Nano… please wait'
          : disabled
            ? 'Running…'
            : 'Describe what to do with your tabs…'

  const inputDisabled = disabled || availability !== 'available'

  return (
    <div className="chat-input-area">
      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={inputDisabled}
          rows={1}
        />
        <div className="chat-input-actions">
          {disabled ? (
            <button className="btn btn-cancel" onClick={onCancel}>
              Cancel action
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              {value.trim() && (
                <button
                  className="btn btn-secondary rephrase-input-btn"
                  onClick={onRephrase}
                  type="button"
                  disabled={availability !== 'available'}
                  title="Optimize and rephrase this prompt"
                >
                  ✨ Rephrase
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!value.trim() || availability !== 'available'}
              >
                Run Action
              </button>
            </div>
          )}
        </div>
      </div>
      {!disabled && <p className="input-hint">Press Enter to run · Shift+Enter for newline</p>}
    </div>
  )
}
