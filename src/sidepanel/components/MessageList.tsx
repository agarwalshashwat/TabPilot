import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../App'
import type { TaskStatus } from '../../shared/types'

interface Props {
  messages: ChatMessage[]
  lastUserPrompt: string
  taskStatus: TaskStatus
  onRetry: () => void
  onRephrase: () => void
  onSuggestionClick?: (text: string) => void
  isThinking?: boolean
}

export function MessageList({
  messages,
  lastUserPrompt,
  taskStatus,
  onRetry,
  onRephrase,
  onSuggestionClick,
  isThinking,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    const suggestions = [
      'Close all tabs from github.com',
      'Group all news sites',
      'Scroll to bottom and click "Load More"',
    ]

    return (
      <div className="message-list-empty">
        <div className="empty-state-icon">🪄</div>
        <h2>Ready to help</h2>
        <p>Describe what you want to do with your tabs.</p>
        <div className="empty-suggestions">
          {suggestions.map((s) => (
            <div
              key={s}
              className="suggestion-chip"
              onClick={() => onSuggestionClick?.(s.replace(/[""]/g, ''))}
            >
              "{s}"
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`message ${msg.role}${msg.role === 'assistant' && msg.content.startsWith('Error:') ? ' error' : ''}`}
        >
          {msg.content}
        </div>
      ))}
      {taskStatus !== 'running' && !isThinking && lastUserPrompt.trim() && (
        <div
          className="retry-wrap"
          style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}
        >
          <button className="retry-btn" onClick={onRetry}>
            ↩ Retry
          </button>
          <button className="retry-btn rephrase-btn" onClick={onRephrase}>
            ✨ Rephrase & Run
          </button>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
