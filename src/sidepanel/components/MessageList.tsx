import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../App'
import type { TaskStatus } from '../../shared/types'

interface Props {
  messages: ChatMessage[]
  lastUserPrompt: string
  taskStatus: TaskStatus
  onRetry: () => void
  onRephrase: () => void
  isThinking?: boolean
}

export function MessageList({ messages, lastUserPrompt, taskStatus, onRetry, onRephrase, isThinking }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="message-list-empty">
        <strong>Tab AI Pilot</strong>
        <br />
        Describe what you want to do with your tabs.
        <br />
        <em>e.g. "Open GitHub and close all other tabs"</em>
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
        <div className="retry-wrap" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
