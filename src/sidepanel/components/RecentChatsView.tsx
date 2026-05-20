export interface RecentChatItem {
  id: string
  title: string
  updatedAt: number
  messageCount: number
}

interface Props {
  chats: RecentChatItem[]
  activeChatId: string | null
  onSelect: (chatId: string) => void
}

function formatRelativeTime(ts: number): string {
  const deltaMs = Date.now() - ts
  if (deltaMs < 30_000) return 'just now'
  const mins = Math.floor(deltaMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export function RecentChatsView({ chats, activeChatId, onSelect }: Props) {
  return (
    <div className="recent-chats-view">
      <div className="recent-chats-header">
        <span className="recent-chats-count">{chats.length} recent</span>
      </div>
      {chats.length === 0 ? (
        <div className="recent-chats-empty">
          <strong>No recent chats</strong>
          <span>Start a conversation in Chat to populate this list.</span>
        </div>
      ) : (
        <ul className="recent-chats-list">
          {chats.map((chat) => (
            <li key={chat.id}>
              <button
                className={`recent-chat-card${activeChatId === chat.id ? ' active' : ''}`}
                onClick={() => onSelect(chat.id)}
              >
                <div className="recent-chat-title" title={chat.title}>
                  {chat.title}
                </div>
                <div className="recent-chat-meta">
                  <span>{chat.messageCount} msgs</span>
                  <span>•</span>
                  <span>{formatRelativeTime(chat.updatedAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
