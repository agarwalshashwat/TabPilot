import type { ActionWithStatus } from '../App'
import type { TaskStatus } from '../../shared/types'
import type { TabAction } from '../../shared/types'

interface Props {
  actions: ActionWithStatus[]
  taskStatus: TaskStatus
}

const STATUS_ICONS: Record<ActionWithStatus['status'], string> = {
  pending: '○',
  running: '●',
  done: '✓',
  error: '!',
}

function formatAction(action: TabAction): string {
  switch (action.type) {
    case 'openTab':
      return `Open tab → ${action.url}`
    case 'closeTab':
      return `Close tab #${action.tabId}`
    case 'switchTab':
      return `Switch to tab #${action.tabId}`
    case 'navigateTo':
      return `Navigate tab #${action.tabId} → ${action.url}`
    case 'clickElement':
      return `Click [${action.selector}] on tab #${action.tabId}`
    case 'fillForm':
      return `Fill [${action.selector}] = "${action.value}" on tab #${action.tabId}`
    case 'getPageContent':
      return `Read page content from tab #${action.tabId}`
    case 'groupTabs':
      return `Group tabs [${action.tabIds.join(', ')}]${action.title ? ` → "${action.title}"` : ''}`
    case 'waitMs':
      return `Wait ${action.ms} ms`
    case 'scroll':
      return `Scroll ${action.direction} ${action.pixels}px on tab #${action.tabId}`
    default:
      return `Unknown action (${(action as { type?: string }).type ?? 'unknown'})`
  }
}

function formatDebug(debug: ActionWithStatus['debug']): string[] {
  if (!debug) return []
  const lines: string[] = []
  if (debug.mode) {
    const fallback = debug.fallbackUsed ? ' (selector fallback used)' : ''
    lines.push(`Mode: ${debug.mode}${fallback}`)
  }
  lines.push(`Query: ${debug.query}`)
  if (debug.selected?.picked) {
    const score = typeof debug.selected.score === 'number' ? ` score=${debug.selected.score}` : ''
    const candidates =
      typeof debug.selected.candidates === 'number'
        ? ` candidates=${debug.selected.candidates}`
        : ''
    lines.push(`Picked: ${debug.selected.picked}${score}${candidates}`)
  }
  if (debug.attempts.length > 0) {
    const attempts = debug.attempts
      .map((a) => {
        const parts = [`#${a.attempt}`, a.success ? 'ok' : 'fail']
        if (a.picked) parts.push(`picked=${a.picked}`)
        if (typeof a.score === 'number') parts.push(`score=${a.score}`)
        if (a.error) parts.push(`error=${a.error}`)
        return parts.join(' ')
      })
      .join(' | ')
    lines.push(`Attempts: ${attempts}`)
  }
  return lines
}

export function ActionLog({ actions, taskStatus }: Props) {
  const header =
    taskStatus === 'running'
      ? 'Running…'
      : taskStatus === 'success'
        ? 'Completed'
        : taskStatus === 'error'
          ? 'Failed'
          : 'Actions'

  return (
    <div className="action-log">
      <div className="action-log-header">{header}</div>
      {actions.map(({ action, status, error, debug }, i) => (
        <div key={i} className="action-item">
          <span className={`action-icon ${status}`}>{STATUS_ICONS[status]}</span>
          <div className="action-label">
            {formatAction(action)}
            {error && <div className="action-error">{error}</div>}
            {formatDebug(debug).map((line, idx) => (
              <div key={idx} className="action-debug">
                {line}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
