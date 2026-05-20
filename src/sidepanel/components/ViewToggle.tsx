import type { SidepanelView } from '../../shared/types'

interface Props {
  activeView: SidepanelView
  onSwitch: (view: SidepanelView) => void
}

export function ViewToggle({ activeView, onSwitch }: Props) {
  return (
    <div className="view-toggle">
      <button
        className={`view-toggle-btn${activeView === 'chat' ? ' active' : ''}`}
        onClick={() => onSwitch('chat')}
      >
        Chat
      </button>
      <button
        className={`view-toggle-btn${activeView === 'recent' ? ' active' : ''}`}
        onClick={() => onSwitch('recent')}
      >
        Recent Chats
      </button>
      <button
        className={`view-toggle-btn${activeView === 'routines' ? ' active' : ''}`}
        onClick={() => onSwitch('routines')}
      >
        Routines
      </button>
      <button
        className={`view-toggle-btn${activeView === 'memory' ? ' active' : ''}`}
        onClick={() => onSwitch('memory')}
      >
        Memory
      </button>
    </div>
  )
}
