import type { ActionWithStatus } from '../App'
import type { TaskStatus, VerificationStageStatus } from '../../shared/types'

interface Props {
  isThinking: boolean
  taskStatus: TaskStatus
  actions: ActionWithStatus[]
  verification: {
    status: VerificationStageStatus | 'idle'
    attempt: number
    maxAttempts: number
    reason?: string
  }
}

type RowState = 'pending' | 'active' | 'done'

function rowClass(state: RowState): string {
  if (state === 'done') return 'done'
  if (state === 'active') return 'active'
  return 'pending'
}

function rowIcon(state: RowState): string {
  if (state === 'done') return '✓'
  if (state === 'active') return '●'
  return '○'
}

export function ExecutionInsights({ isThinking, taskStatus, actions, verification }: Props) {
  const hasActions = actions.length > 0
  const hasStartedExecution = actions.some((a) => a.status !== 'pending')
  const runningAction = actions.find((a) => a.status === 'running')
  const hasDomAction = actions.some(
    (a) => a.action.type === 'clickElement' || a.action.type === 'fillForm'
  )

  const latestDomDebug = [...actions]
    .reverse()
    .find((a) => a.debug && (a.action.type === 'clickElement' || a.action.type === 'fillForm'))

  const planningState: RowState = hasActions ? 'done' : isThinking ? 'active' : 'pending'
  const executionState: RowState =
    taskStatus === 'running' && hasActions
      ? 'active'
      : hasStartedExecution && taskStatus !== 'running'
        ? 'done'
        : 'pending'

  const pageLoadState: RowState =
    taskStatus === 'running' && hasStartedExecution
      ? 'active'
      : hasStartedExecution && taskStatus !== 'running'
        ? 'done'
        : 'pending'

  const domState: RowState = !hasDomAction
    ? 'pending'
    : taskStatus === 'running' &&
        (runningAction?.action.type === 'clickElement' || runningAction?.action.type === 'fillForm')
      ? 'active'
      : latestDomDebug
        ? 'done'
        : 'pending'

  const domDetails = latestDomDebug?.debug?.selected?.picked
    ? `Latest picked element: ${latestDomDebug.debug.selected.picked}`
    : runningAction &&
        (runningAction.action.type === 'clickElement' || runningAction.action.type === 'fillForm')
      ? `Resolving target from live DOM using query: ${runningAction.action.selector}`
      : 'Targets are resolved after load from the current DOM, not before navigation.'

  const verifyState: RowState =
    verification.status === 'running'
      ? 'active'
      : verification.status === 'passed'
        ? 'done'
        : verification.status === 'failed'
          ? 'active'
          : 'pending'

  const verifyDetails =
    verification.status === 'running'
      ? `Checking execution against your prompt (attempt ${verification.attempt}/${verification.maxAttempts}).`
      : verification.status === 'passed'
        ? `Execution matched your prompt on attempt ${verification.attempt}/${verification.maxAttempts}.`
        : verification.status === 'failed'
          ? `Mismatch on attempt ${verification.attempt}/${verification.maxAttempts}: ${verification.reason ?? 'Goal not fully achieved.'}`
          : 'Verifier confirms whether execution truly matched your request.'

  return (
    <div className="execution-insights">
      <div className="execution-insights-header">Plan vs Execution</div>
      <div className={`execution-row ${rowClass(planningState)}`}>
        <span className="execution-row-icon">{rowIcon(planningState)}</span>
        <div>
          <div className="execution-row-title">Planning</div>
          <div className="execution-row-desc">AI builds the action sequence first.</div>
        </div>
      </div>
      <div className={`execution-row ${rowClass(executionState)}`}>
        <span className="execution-row-icon">{rowIcon(executionState)}</span>
        <div>
          <div className="execution-row-title">Execution Start</div>
          <div className="execution-row-desc">Actions begin only after the plan is returned.</div>
        </div>
      </div>
      <div className={`execution-row ${rowClass(pageLoadState)}`}>
        <span className="execution-row-icon">{rowIcon(pageLoadState)}</span>
        <div>
          <div className="execution-row-title">Page-Ready Gate</div>
          <div className="execution-row-desc">
            DOM actions wait for tab load before interacting with the page.
          </div>
        </div>
      </div>
      <div className={`execution-row ${rowClass(domState)}`}>
        <span className="execution-row-icon">{rowIcon(domState)}</span>
        <div>
          <div className="execution-row-title">DOM Target Resolution</div>
          <div className="execution-row-desc">{domDetails}</div>
        </div>
      </div>
      <div className={`execution-row ${rowClass(verifyState)}`}>
        <span className="execution-row-icon">{rowIcon(verifyState)}</span>
        <div>
          <div className="execution-row-title">Verification</div>
          <div className="execution-row-desc">{verifyDetails}</div>
        </div>
      </div>
    </div>
  )
}
