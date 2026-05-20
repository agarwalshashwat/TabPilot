// ── Tab actions (executed by the service worker) ─────────────────────────────

export interface OpenTabAction {
  type: 'openTab'
  url: string
}
export interface CloseTabAction {
  type: 'closeTab'
  tabId: number
}
export interface SwitchTabAction {
  type: 'switchTab'
  tabId: number
}
export interface NavigateToAction {
  type: 'navigateTo'
  tabId: number
  url: string
}

export interface ElementDescriptor {
  intent?: string
  label?: string
  role?: string
}

export interface ClickElementAction {
  type: 'clickElement'
  tabId: number
  selector: string
  descriptor?: ElementDescriptor
}
export interface FillFormAction {
  type: 'fillForm'
  tabId: number
  selector: string
  value: string
  descriptor?: ElementDescriptor
}
export interface GetPageContentAction {
  type: 'getPageContent'
  tabId: number
}
export interface GroupTabsAction {
  type: 'groupTabs'
  tabIds: number[]
  title?: string
}
export interface WaitMsAction {
  type: 'waitMs'
  ms: number
}

export type TabAction =
  | OpenTabAction
  | CloseTabAction
  | SwitchTabAction
  | NavigateToAction
  | ClickElementAction
  | FillFormAction
  | GetPageContentAction
  | GroupTabsAction
  | WaitMsAction

// ── AI response shape ─────────────────────────────────────────────────────────

export interface AIResponse {
  explanation: string
  actions: TabAction[]
}

// ── Tab context passed to the AI ──────────────────────────────────────────────

export interface TabInfo {
  id: number
  url: string
  title: string
  active: boolean
}

// ── Shared enums ──────────────────────────────────────────────────────────────

export type AIAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'needs_api_key'

// ── AI Provider settings ──────────────────────────────────────────────────────

export type AIProvider = 'chrome' | 'openai' | 'anthropic' | 'gemini'

export interface AISettings {
  provider: AIProvider
  openaiKey: string
  openaiModel: string
  anthropicKey: string
  anthropicModel: string
  geminiKey: string
  geminiModel: string
}

export type TaskStatus = 'idle' | 'running' | 'success' | 'error'
export type SidepanelView = 'chat' | 'recent' | 'routines' | 'memory'

export interface AgentMemory {
  id: string
  text: string
  createdAt: number
  /** LRU recency marker (epoch ms). Updated whenever memory is used/accessed. */
  lastAccessedAt: number
}

// ── Messages: Worker → Side Panel ─────────────────────────────────────────────

export interface AIAvailabilityMessage {
  type: 'AI_AVAILABILITY'
  availability: AIAvailability
}
export interface AIResponseMessage {
  type: 'AI_RESPONSE'
  explanation: string
  actions: TabAction[]
}
export interface ActionProgressMessage {
  type: 'ACTION_PROGRESS'
  index: number
  total: number
  action: TabAction
  status: 'running' | 'done' | 'error'
  error?: string
  debug?: ActionSelectionDebug
}

export interface ActionSelectionDebug {
  mode?: 'semantic' | 'selector' | 'hybrid'
  fallbackUsed?: boolean
  query: string
  attempts: Array<{
    attempt: number
    success: boolean
    picked?: string
    score?: number
    candidates?: number
    error?: string
  }>
  selected?: {
    picked?: string
    score?: number
    candidates?: number
  }
}
export interface TaskCompleteMessage {
  type: 'TASK_COMPLETE'
}
export interface TaskErrorMessage {
  type: 'TASK_ERROR'
  error: string
}
export interface DownloadProgressMessage {
  type: 'DOWNLOAD_PROGRESS'
  loaded: number
  total: number
}
export interface AIThinkingMessage {
  type: 'AI_THINKING'
}
export interface AIStreamChunkMessage {
  /** Full cumulative response text so far (not a delta). */
  type: 'AI_STREAM_CHUNK'
  text: string
}
export interface AssistantMessage {
  type: 'ASSISTANT_MESSAGE'
  content: string
}
export interface RephrasedPromptMessage {
  type: 'REPHRASED_PROMPT'
  prompt: string
}

export type WorkerOutboundMessage =
  | AIAvailabilityMessage
  | AIResponseMessage
  | ActionProgressMessage
  | TaskCompleteMessage
  | TaskErrorMessage
  | DownloadProgressMessage
  | AIThinkingMessage
  | AIStreamChunkMessage
  | AssistantMessage
  | RoutinesListMessage
  | TaskSnapshotMessage
  | RephrasedPromptMessage

// ── Messages: Side Panel → Worker ─────────────────────────────────────────────

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ExecutePromptMessage {
  type: 'EXECUTE_PROMPT'
  prompt: string
  history?: HistoryMessage[]
}
export interface CheckAIMessage {
  type: 'CHECK_AI'
}
export interface CancelTaskMessage {
  type: 'CANCEL_TASK'
}
export interface TriggerDownloadMessage {
  type: 'TRIGGER_DOWNLOAD'
}
export interface ListRoutinesMessage {
  type: 'LIST_ROUTINES'
}
export interface SaveRoutineMessage {
  type: 'SAVE_ROUTINE'
  name: string
  description: string
  actions: SavedAction[]
}
export interface DeleteRoutineMessage {
  type: 'DELETE_ROUTINE'
  id: string
}
export interface RunRoutineMessage {
  type: 'RUN_ROUTINE'
  id: string
}

export interface SettingsChangedMessage {
  type: 'SETTINGS_CHANGED'
}
export interface RephrasePromptMessage {
  type: 'REPHRASE_PROMPT'
  prompt: string
}

export type WorkerInboundMessage =
  | ExecutePromptMessage
  | CheckAIMessage
  | CancelTaskMessage
  | TriggerDownloadMessage
  | ListRoutinesMessage
  | SaveRoutineMessage
  | DeleteRoutineMessage
  | RunRoutineMessage
  | SettingsChangedMessage
  | RephrasePromptMessage

// ── Routines ──────────────────────────────────────────────────────────────────

/** A TabAction annotated with the URL of the tab it was targeting at save time,
 *  so it can be re-resolved against live tabs when the routine is run later. */
export interface SavedAction {
  action: TabAction
  /** Origin (scheme + host + port) of the target tab at save time. */
  savedTabUrl?: string
}

export interface Routine {
  id: string
  name: string
  description: string // AI explanation at save time
  actions: SavedAction[]
  createdAt: number // Date.now()
}

// ── Routines messages ─────────────────────────────────────────────────────────

export interface RoutinesListMessage {
  type: 'ROUTINES_LIST'
  routines: Routine[]
}

export interface TaskSnapshotMessage {
  type: 'TASK_SNAPSHOT'
  explanation: string
  actions: SavedAction[]
}
