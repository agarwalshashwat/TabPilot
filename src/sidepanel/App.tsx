import { useReducer, useCallback, useState, useEffect, useRef, useMemo } from 'react'
import type {
  ActionSelectionDebug,
  AIAvailability,
  AgentMemory,
  AIProvider,
  VerificationStageStatus,
  Routine,
  SavedAction,
  SidepanelView,
  TabAction,
  TaskStatus,
  HistoryMessage,
} from '../shared/types'
import { useChromeMessages } from './hooks/useChromeMessages'
import { StatusBar } from './components/StatusBar'
import { MessageList } from './components/MessageList'
import { ThinkingBubble } from './components/ThinkingBubble'
import { ActionLog } from './components/ActionLog'
import { ChatInput } from './components/ChatInput'
import { ViewToggle } from './components/ViewToggle'
import { RoutinesView } from './components/RoutinesView'
import { MemoryView } from './components/MemoryView'
import { RecentChatsView } from './components/RecentChatsView'
import { SaveRoutineModal } from './components/SaveRoutineModal'
import { SettingsModal } from './components/SettingsModal'
import { ExecutionInsights } from './components/ExecutionInsights'

const PROVIDER_LABELS: Record<AIProvider, string> = {
  chrome: 'Gemini Nano',
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini',
  mock: 'Mock System',
}

const CHAT_HISTORY_KEY = 'chat_history'
const CHAT_THREADS_STATE_KEY = 'chat_threads_state_v1'
const MAX_CHAT_HISTORY_MESSAGES = 100
const MAX_RECENT_CHATS = 20
const AGENT_MEMORIES_KEY = 'agent_memories'
const AGENT_MEMORIES_CAPACITY = 50

function normalizeMemories(raw: unknown): AgentMemory[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): AgentMemory | null => {
      if (!item || typeof item !== 'object') return null
      const value = item as Partial<AgentMemory>
      if (typeof value.id !== 'string' || typeof value.text !== 'string') return null
      if (typeof value.createdAt !== 'number') return null
      return {
        id: value.id,
        text: value.text,
        createdAt: value.createdAt,
        lastAccessedAt:
          typeof value.lastAccessedAt === 'number' ? value.lastAccessedAt : value.createdAt,
      }
    })
    .filter((m): m is AgentMemory => m != null)
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, AGENT_MEMORIES_CAPACITY)
}

function readProviderLabel(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('ai_settings', (result) => {
      const stored = result['ai_settings'] as { provider?: AIProvider } | undefined
      const provider: AIProvider = stored?.provider ?? 'chrome'
      resolve(PROVIDER_LABELS[provider])
    })
  })
}

// ── State ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ActionWithStatus {
  action: TabAction
  status: 'pending' | 'running' | 'done' | 'error'
  error?: string
  debug?: ActionSelectionDebug
}

interface ChatStoreState {
  activeChatId: string | null
  threads: Record<string, ChatMessage[]>
  updatedAtById: Record<string, number>
}

interface StoredChatThreadsState {
  activeChatId?: unknown
  threads?: unknown
  updatedAtById?: unknown
}

function normalizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (msg): msg is ChatMessage =>
        !!msg &&
        typeof msg === 'object' &&
        typeof (msg as ChatMessage).id === 'string' &&
        ((msg as ChatMessage).role === 'user' || (msg as ChatMessage).role === 'assistant') &&
        typeof (msg as ChatMessage).content === 'string'
    )
    .slice(-MAX_CHAT_HISTORY_MESSAGES)
}

function deriveChatTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim())
  const source = firstUser?.content.trim() || 'New chat'
  return source.length > 64 ? `${source.slice(0, 64).trimEnd()}…` : source
}

function applyChatCapacity(store: ChatStoreState): ChatStoreState {
  const ids = Object.keys(store.threads)
  if (ids.length <= MAX_RECENT_CHATS) return store

  const sorted = [...ids].sort(
    (a, b) => (store.updatedAtById[b] ?? 0) - (store.updatedAtById[a] ?? 0)
  )
  const keep = new Set(sorted.slice(0, MAX_RECENT_CHATS))
  if (store.activeChatId) keep.add(store.activeChatId)

  const nextThreads: Record<string, ChatMessage[]> = {}
  const nextUpdatedAtById: Record<string, number> = {}
  for (const id of keep) {
    if (store.threads[id]) {
      nextThreads[id] = store.threads[id]
      nextUpdatedAtById[id] = store.updatedAtById[id] ?? Date.now()
    }
  }

  const activeChatId =
    store.activeChatId && nextThreads[store.activeChatId]
      ? store.activeChatId
      : (Object.keys(nextThreads)[0] ?? null)

  return { activeChatId, threads: nextThreads, updatedAtById: nextUpdatedAtById }
}

function normalizeStoredChatThreadsState(raw: unknown): ChatStoreState | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as StoredChatThreadsState
  if (!value.threads || typeof value.threads !== 'object') return null

  const threads: Record<string, ChatMessage[]> = {}
  for (const [id, maybeMessages] of Object.entries(value.threads as Record<string, unknown>)) {
    if (!id) continue
    threads[id] = normalizeMessages(maybeMessages)
  }

  if (Object.keys(threads).length === 0) return null

  const updatedAtById: Record<string, number> = {}
  const rawUpdated =
    value.updatedAtById && typeof value.updatedAtById === 'object'
      ? (value.updatedAtById as Record<string, unknown>)
      : {}
  for (const id of Object.keys(threads)) {
    const maybeTs = rawUpdated[id]
    updatedAtById[id] = typeof maybeTs === 'number' ? maybeTs : Date.now()
  }

  const candidateId = typeof value.activeChatId === 'string' ? value.activeChatId : null
  const activeChatId = candidateId && threads[candidateId] ? candidateId : Object.keys(threads)[0]

  return applyChatCapacity({ activeChatId, threads, updatedAtById })
}

interface AppState {
  messages: ChatMessage[]
  lastUserPrompt: string
  currentActions: ActionWithStatus[]
  verification: {
    status: VerificationStageStatus | 'idle'
    attempt: number
    maxAttempts: number
    reason?: string
  }
  taskStatus: TaskStatus
  aiAvailability: AIAvailability | null
  downloadProgress: { loaded: number; total: number } | null
  isThinking: boolean
  thinkingText: string
  routines: Routine[]
  memories: AgentMemory[]
  activeView: SidepanelView
  showSettings: boolean
  showSaveRoutineModal: boolean
  /** Pending routine data shown in the Save modal after a successful task. */
  pendingRoutine: { explanation: string; actions: SavedAction[] } | null
}

// ── Reducer ───────────────────────────────────────────────────────────────────

export type AppAction =
  | { type: 'LOAD_HISTORY'; messages: ChatMessage[] }
  | { type: 'ADD_USER_MESSAGE'; content: string }
  | { type: 'SET_AI_AVAILABILITY'; availability: AIAvailability }
  | { type: 'SET_AI_RESPONSE'; explanation: string; actions: TabAction[] }
  | { type: 'SET_ASSISTANT_MESSAGE'; content: string }
  | {
      type: 'UPDATE_ACTION_PROGRESS'
      index: number
      status: 'running' | 'done' | 'error'
      error?: string
      debug?: ActionSelectionDebug
    }
  | { type: 'SET_TASK_COMPLETE' }
  | { type: 'SET_TASK_ERROR'; error: string }
  | {
      type: 'SET_TASK_VERIFICATION'
      status: VerificationStageStatus
      attempt: number
      maxAttempts: number
      reason?: string
    }
  | { type: 'SET_DOWNLOAD_PROGRESS'; loaded: number; total: number }
  | { type: 'SET_AI_THINKING' }
  | { type: 'SET_THINKING_TEXT'; text: string }
  | { type: 'SET_ROUTINES'; routines: Routine[] }
  | { type: 'SET_MEMORIES'; memories: AgentMemory[] }
  | { type: 'SET_ACTIVE_VIEW'; view: SidepanelView }
  | { type: 'SET_SHOW_SETTINGS'; show: boolean }
  | { type: 'SET_SHOW_SAVE_ROUTINE_MODAL'; show: boolean }
  | { type: 'SET_TASK_SNAPSHOT'; explanation: string; actions: SavedAction[] }
  | { type: 'CLEAR_CHAT' }
  | { type: 'CLEAR_PENDING_ROUTINE' }
  | { type: 'START_REPHRASED_TASK'; prompt: string }
  | { type: 'SET_REPHRASED_PROMPT'; prompt: string }

const initialState: AppState = {
  messages: [],
  lastUserPrompt: '',
  currentActions: [],
  verification: {
    status: 'idle',
    attempt: 0,
    maxAttempts: 3,
  },
  taskStatus: 'idle',
  aiAvailability: null,
  downloadProgress: null,
  isThinking: false,
  thinkingText: '',
  routines: [],
  memories: [],
  activeView: 'chat',
  showSettings: false,
  showSaveRoutineModal: false,
  pendingRoutine: null,
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_HISTORY': {
      let lastUserPrompt = ''
      for (let i = action.messages.length - 1; i >= 0; i--) {
        if (action.messages[i].role === 'user') {
          lastUserPrompt = action.messages[i].content
          break
        }
      }
      return {
        ...state,
        messages: action.messages,
        lastUserPrompt,
        currentActions: [],
        verification: { status: 'idle', attempt: 0, maxAttempts: 3 },
        taskStatus: 'idle',
        isThinking: false,
        thinkingText: '',
        showSaveRoutineModal: false,
        pendingRoutine: null,
      }
    }

    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        lastUserPrompt: action.content,
        currentActions: [],
        verification: { status: 'idle', attempt: 0, maxAttempts: 3 },
        taskStatus: 'running',
        isThinking: false,
        thinkingText: '',
        showSaveRoutineModal: false,
        pendingRoutine: null,
        messages: [
          ...state.messages,
          { id: crypto.randomUUID(), role: 'user', content: action.content },
        ],
      }

    case 'SET_AI_AVAILABILITY':
      return {
        ...state,
        aiAvailability: action.availability,
        downloadProgress:
          action.availability === 'available' || action.availability === 'unavailable'
            ? null
            : state.downloadProgress,
      }

    case 'SET_AI_RESPONSE':
      return {
        ...state,
        // isThinking stays true through executor phase — cleared by TASK_COMPLETE/ERROR
        currentActions: action.actions.map((a) => ({ action: a, status: 'pending' as const })),
        messages: [
          ...state.messages,
          { id: crypto.randomUUID(), role: 'assistant', content: action.explanation },
        ],
      }

    case 'SET_ASSISTANT_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: crypto.randomUUID(), role: 'assistant', content: action.content },
        ],
      }

    case 'UPDATE_ACTION_PROGRESS': {
      const updated = [...state.currentActions]
      updated[action.index] = {
        ...updated[action.index],
        status: action.status,
        error: action.error,
        debug: action.debug,
      }
      return { ...state, currentActions: updated }
    }

    case 'SET_TASK_COMPLETE':
      return { ...state, taskStatus: 'success', isThinking: false, thinkingText: '' }

    case 'SET_TASK_VERIFICATION':
      return {
        ...state,
        verification: {
          status: action.status,
          attempt: action.attempt,
          maxAttempts: action.maxAttempts,
          reason: action.reason,
        },
      }

    case 'SET_TASK_ERROR':
      return {
        ...state,
        taskStatus: 'error',
        verification:
          state.verification.status === 'running'
            ? { ...state.verification, status: 'failed', reason: action.error }
            : state.verification,
        isThinking: false,
        thinkingText: '',
        messages: [
          ...state.messages,
          { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${action.error}` },
        ],
      }

    case 'SET_AI_THINKING':
      return { ...state, isThinking: true, thinkingText: '' }

    case 'SET_THINKING_TEXT':
      return { ...state, thinkingText: action.text }

    case 'SET_DOWNLOAD_PROGRESS':
      return { ...state, downloadProgress: { loaded: action.loaded, total: action.total } }

    case 'SET_ROUTINES':
      return { ...state, routines: action.routines }

    case 'SET_MEMORIES':
      return { ...state, memories: action.memories }

    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.view }

    case 'SET_SHOW_SETTINGS':
      return { ...state, showSettings: action.show }

    case 'SET_SHOW_SAVE_ROUTINE_MODAL':
      return { ...state, showSaveRoutineModal: action.show }

    case 'SET_TASK_SNAPSHOT':
      // Only show Save modal when there are actions worth saving
      return action.actions.length > 0
        ? { ...state, pendingRoutine: { explanation: action.explanation, actions: action.actions } }
        : state

    case 'CLEAR_CHAT':
      return {
        ...state,
        messages: [],
        lastUserPrompt: '',
        currentActions: [],
        verification: { status: 'idle', attempt: 0, maxAttempts: 3 },
        taskStatus: 'idle',
        isThinking: false,
        thinkingText: '',
        showSaveRoutineModal: false,
        pendingRoutine: null,
      }

    case 'CLEAR_PENDING_ROUTINE':
      return { ...state, pendingRoutine: null, showSaveRoutineModal: false }

    case 'SET_REPHRASED_PROMPT': {
      const updatedMessages = [...state.messages]
      for (let i = updatedMessages.length - 1; i >= 0; i--) {
        if (updatedMessages[i].role === 'user') {
          updatedMessages[i] = { ...updatedMessages[i], content: action.prompt }
          break
        }
      }
      return {
        ...state,
        lastUserPrompt: action.prompt,
        activeView: 'chat',
        messages: updatedMessages,
      }
    }

    case 'START_REPHRASED_TASK': {
      const updatedMessages = [...state.messages]
      for (let i = updatedMessages.length - 1; i >= 0; i--) {
        if (updatedMessages[i].role === 'user') {
          updatedMessages[i] = { ...updatedMessages[i], content: action.prompt }
          break
        }
      }
      return {
        ...state,
        lastUserPrompt: action.prompt,
        currentActions: [],
        verification: { status: 'idle', attempt: 0, maxAttempts: 3 },
        taskStatus: 'running',
        isThinking: false,
        thinkingText: '',
        showSaveRoutineModal: false,
        pendingRoutine: null,
        activeView: 'chat',
        messages: updatedMessages,
      }
    }

    default:
      return state
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [providerLabel, setProviderLabel] = useState('Gemini Nano')
  const [inputPrompt, setInputPrompt] = useState('')
  const [chatStore, setChatStore] = useState<ChatStoreState>({
    activeChatId: null,
    threads: {},
    updatedAtById: {},
  })
  const isRephrasingInputRef = useRef(false)
  const hasHydratedChatsRef = useRef(false)

  // Read the active provider label from storage on mount.
  useEffect(() => {
    readProviderLabel().then(setProviderLabel)
  }, [])

  useEffect(() => {
    chrome.storage.local.get([CHAT_THREADS_STATE_KEY, CHAT_HISTORY_KEY], (result) => {
      const normalized = normalizeStoredChatThreadsState(result[CHAT_THREADS_STATE_KEY])
      if (normalized) {
        hasHydratedChatsRef.current = true
        setChatStore(normalized)
        dispatch({
          type: 'LOAD_HISTORY',
          messages: normalized.threads[normalized.activeChatId ?? ''] ?? [],
        })
        return
      }

      const legacyMessages = normalizeMessages(result[CHAT_HISTORY_KEY])
      const initialChatId = crypto.randomUUID()
      const initialStore: ChatStoreState = {
        activeChatId: initialChatId,
        threads: {
          [initialChatId]: legacyMessages,
        },
        updatedAtById: {
          [initialChatId]: Date.now(),
        },
      }

      hasHydratedChatsRef.current = true
      setChatStore(initialStore)
      dispatch({ type: 'LOAD_HISTORY', messages: legacyMessages })

      if (legacyMessages.length > 0) {
        chrome.storage.local.remove(CHAT_HISTORY_KEY)
      }
    })
  }, [])

  useEffect(() => {
    chrome.storage.local.get(AGENT_MEMORIES_KEY, (result) => {
      const memories = normalizeMemories(result[AGENT_MEMORIES_KEY])
      dispatch({ type: 'SET_MEMORIES', memories })
      chrome.storage.local.set({ [AGENT_MEMORIES_KEY]: memories })
    })
  }, [])

  useEffect(() => {
    if (!hasHydratedChatsRef.current) return
    if (!chatStore.activeChatId) return

    const chatId = chatStore.activeChatId
    const bounded = state.messages.slice(-MAX_CHAT_HISTORY_MESSAGES)

    setChatStore((prev) => {
      const previousMessages = prev.threads[chatId] ?? []
      const sameLength = previousMessages.length === bounded.length
      const isSame =
        sameLength &&
        previousMessages.every(
          (msg, idx) =>
            msg.id === bounded[idx]?.id &&
            msg.role === bounded[idx]?.role &&
            msg.content === bounded[idx]?.content
        )
      if (isSame) return prev

      return applyChatCapacity({
        ...prev,
        threads: {
          ...prev.threads,
          [chatId]: bounded,
        },
        updatedAtById: {
          ...prev.updatedAtById,
          [chatId]: Date.now(),
        },
      })
    })
  }, [state.messages, chatStore.activeChatId])

  useEffect(() => {
    if (!hasHydratedChatsRef.current) return
    const timeout = setTimeout(() => {
      chrome.storage.local.set({
        [CHAT_THREADS_STATE_KEY]: applyChatCapacity(chatStore),
      })
    }, 150)
    return () => clearTimeout(timeout)
  }, [chatStore])

  const recentChats = useMemo(() => {
    return Object.keys(chatStore.threads)
      .map((id) => {
        const messages = chatStore.threads[id] ?? []
        return {
          id,
          title: deriveChatTitle(messages),
          updatedAt: chatStore.updatedAtById[id] ?? 0,
          messageCount: messages.length,
        }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RECENT_CHATS)
  }, [chatStore])

  const sendPromptRef = useRef<((prompt: string) => void) | null>(null)

  const handleWorkerMessage = useCallback((msg: Parameters<typeof dispatch>[0]) => {
    if (msg.type === 'SET_REPHRASED_PROMPT') {
      if (isRephrasingInputRef.current) {
        setInputPrompt(msg.prompt)
        dispatch({ type: 'SET_TASK_COMPLETE' })
      } else {
        dispatch({ type: 'START_REPHRASED_TASK', prompt: msg.prompt })
        sendPromptRef.current?.(msg.prompt)
      }
    } else {
      dispatch(msg)
    }
  }, [])

  const {
    sendPrompt,
    cancelTask,
    triggerDownload,
    saveRoutine,
    deleteRoutine,
    runRoutine,
    notifySettingsChanged,
    rephrasePrompt,
  } = useChromeMessages(handleWorkerMessage)

  useEffect(() => {
    sendPromptRef.current = sendPrompt
  }, [sendPrompt])

  // Called by SettingsModal after saving — refresh provider label and notify worker.
  const handleSettingsChanged = useCallback(() => {
    readProviderLabel().then(setProviderLabel)
    notifySettingsChanged()
  }, [notifySettingsChanged])

  const handleSubmit = useCallback(
    (prompt: string) => {
      const history: HistoryMessage[] = state.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      dispatch({ type: 'ADD_USER_MESSAGE', content: prompt })
      dispatch({ type: 'SET_ACTIVE_VIEW', view: 'chat' })
      sendPrompt(prompt, history)
      setInputPrompt('')
    },
    [state.messages, sendPrompt]
  )

  const handleSaveRoutine = useCallback(
    (name: string) => {
      if (!state.pendingRoutine) return
      saveRoutine(name, state.pendingRoutine.explanation, state.pendingRoutine.actions)
      dispatch({ type: 'CLEAR_PENDING_ROUTINE' })
    },
    [state.pendingRoutine, saveRoutine]
  )

  const handleRunRoutine = useCallback(
    (id: string) => {
      dispatch({ type: 'SET_ACTIVE_VIEW', view: 'chat' })
      runRoutine(id)
    },
    [runRoutine]
  )

  const handleOpenSaveRoutineModal = useCallback(() => {
    if (!state.pendingRoutine) return
    dispatch({ type: 'SET_SHOW_SAVE_ROUTINE_MODAL', show: true })
  }, [state.pendingRoutine])

  const handleRetry = useCallback(() => {
    const prompt = state.lastUserPrompt.trim()
    if (!prompt || state.taskStatus === 'running') return
    handleSubmit(prompt)
  }, [state.lastUserPrompt, state.taskStatus, handleSubmit])

  const handleRephrase = useCallback(() => {
    const prompt = state.lastUserPrompt.trim()
    if (!prompt || state.taskStatus === 'running') return
    isRephrasingInputRef.current = false
    dispatch({ type: 'SET_AI_THINKING' })
    rephrasePrompt(prompt)
  }, [state.lastUserPrompt, state.taskStatus, rephrasePrompt])

  const handleRephraseInput = useCallback(() => {
    const prompt = inputPrompt.trim()
    if (!prompt || state.taskStatus === 'running') return
    isRephrasingInputRef.current = true
    dispatch({ type: 'SET_AI_THINKING' })
    rephrasePrompt(prompt)
  }, [inputPrompt, state.taskStatus, rephrasePrompt])

  const handleNewChat = useCallback(() => {
    cancelTask()
    const newChatId = crypto.randomUUID()
    setChatStore((prev) =>
      applyChatCapacity({
        ...prev,
        activeChatId: newChatId,
        threads: {
          ...prev.threads,
          [newChatId]: [],
        },
        updatedAtById: {
          ...prev.updatedAtById,
          [newChatId]: Date.now(),
        },
      })
    )
    dispatch({ type: 'CLEAR_CHAT' })
    dispatch({ type: 'SET_ACTIVE_VIEW', view: 'chat' })
    setInputPrompt('')
  }, [cancelTask])

  const handleSelectRecentChat = useCallback(
    (chatId: string) => {
      const selected = chatStore.threads[chatId]
      if (!selected) return
      cancelTask()
      setChatStore((prev) =>
        applyChatCapacity({
          ...prev,
          activeChatId: chatId,
          updatedAtById: {
            ...prev.updatedAtById,
            [chatId]: Date.now(),
          },
        })
      )
      dispatch({ type: 'LOAD_HISTORY', messages: selected })
      dispatch({ type: 'SET_ACTIVE_VIEW', view: 'chat' })
    },
    [chatStore.threads, cancelTask]
  )

  const handleDeleteRecentChat = useCallback(
    (chatId: string) => {
      cancelTask()

      let nextActiveChatId: string | null = null
      let nextMessages: ChatMessage[] = []

      setChatStore((prev) => {
        const threads = { ...prev.threads }
        const updatedAtById = { ...prev.updatedAtById }

        delete threads[chatId]
        delete updatedAtById[chatId]

        const remainingIds = Object.keys(threads)
        if (remainingIds.length > 0) {
          const sorted = [...remainingIds].sort(
            (a, b) => (updatedAtById[b] ?? 0) - (updatedAtById[a] ?? 0)
          )
          nextActiveChatId =
            prev.activeChatId && threads[prev.activeChatId]
              ? prev.activeChatId
              : (sorted[0] ?? null)
          nextMessages = nextActiveChatId ? (threads[nextActiveChatId] ?? []) : []
        } else {
          nextActiveChatId = null
          nextMessages = []
        }

        const nextStore = applyChatCapacity({
          activeChatId: nextActiveChatId,
          threads,
          updatedAtById,
        })

        nextActiveChatId = nextStore.activeChatId
        nextMessages = nextActiveChatId ? (nextStore.threads[nextActiveChatId] ?? []) : []

        return nextStore
      })

      if (nextActiveChatId) {
        dispatch({ type: 'LOAD_HISTORY', messages: nextMessages })
      } else {
        dispatch({ type: 'CLEAR_CHAT' })
      }

      dispatch({ type: 'SET_ACTIVE_VIEW', view: 'recent' })
    },
    [cancelTask]
  )

  const canStartNewChat = state.messages.length > 0 || state.taskStatus === 'running'

  const handleAddMemory = useCallback(
    (text: string) => {
      const now = Date.now()
      const next: AgentMemory = {
        id: crypto.randomUUID(),
        text,
        createdAt: now,
        lastAccessedAt: now,
      }
      const updated = [...state.memories, next]
        .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
        .slice(0, AGENT_MEMORIES_CAPACITY)
      dispatch({ type: 'SET_MEMORIES', memories: updated })
      chrome.storage.local.set({ [AGENT_MEMORIES_KEY]: updated })
    },
    [state.memories]
  )

  const handleDeleteMemory = useCallback(
    (id: string) => {
      const updated = state.memories.filter((m) => m.id !== id)
      dispatch({ type: 'SET_MEMORIES', memories: updated })
      chrome.storage.local.set({ [AGENT_MEMORIES_KEY]: updated })
    },
    [state.memories]
  )

  const handleTouchMemory = useCallback(
    (id: string) => {
      const now = Date.now()
      const updated = state.memories
        .map((m) => (m.id === id ? { ...m, lastAccessedAt: now } : m))
        .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
        .slice(0, AGENT_MEMORIES_CAPACITY)
      dispatch({ type: 'SET_MEMORIES', memories: updated })
      chrome.storage.local.set({ [AGENT_MEMORIES_KEY]: updated })
    },
    [state.memories]
  )

  return (
    <div className="app">
      <div className="app-header">
        <div className="app-brand" aria-label="TabPilot">
          <picture>
            <source srcSet="/branding/logo-dark.png" media="(prefers-color-scheme: dark)" />
            <img src="/branding/logo-light.png" alt="TabPilot" />
          </picture>
        </div>
        <StatusBar
          availability={state.aiAvailability}
          onDownload={triggerDownload}
          downloadProgress={state.downloadProgress}
          providerLabel={providerLabel}
        />
        {canStartNewChat && (
          <button
            className="header-new-chat"
            onClick={handleNewChat}
            aria-label="New chat"
            title="Clear conversation and start fresh"
          >
            New chat
          </button>
        )}
        <button
          className="header-gear"
          onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: true })}
          aria-label="Open settings"
          title="AI provider settings"
        >
          ⚙
        </button>
      </div>
      <ViewToggle
        activeView={state.activeView}
        onSwitch={(view) => dispatch({ type: 'SET_ACTIVE_VIEW', view })}
      />
      {state.activeView === 'chat' ? (
        <div className="chat-area">
          <MessageList
            messages={state.messages}
            lastUserPrompt={state.lastUserPrompt}
            taskStatus={state.taskStatus}
            isThinking={state.isThinking}
            onRetry={handleRetry}
            onRephrase={handleRephrase}
            onSuggestionClick={(text) => handleSubmit(text)}
          />
          {state.isThinking && <ThinkingBubble rawJson={state.thinkingText} />}
          {(state.isThinking || state.currentActions.length > 0) && (
            <ExecutionInsights
              isThinking={state.isThinking}
              taskStatus={state.taskStatus}
              actions={state.currentActions}
              verification={state.verification}
            />
          )}
          {state.pendingRoutine &&
            state.taskStatus === 'success' &&
            !state.showSaveRoutineModal && (
              <div className="save-routine-cta">
                <button className="btn-ghost" onClick={handleOpenSaveRoutineModal}>
                  Save as routine
                </button>
              </div>
            )}
          {state.currentActions.length > 0 && (
            <ActionLog actions={state.currentActions} taskStatus={state.taskStatus} />
          )}
        </div>
      ) : state.activeView === 'recent' ? (
        <RecentChatsView
          chats={recentChats}
          activeChatId={chatStore.activeChatId}
          onSelect={handleSelectRecentChat}
          onDelete={handleDeleteRecentChat}
        />
      ) : state.activeView === 'routines' ? (
        <RoutinesView routines={state.routines} onRun={handleRunRoutine} onDelete={deleteRoutine} />
      ) : (
        <MemoryView
          memories={state.memories}
          onAdd={handleAddMemory}
          onDelete={handleDeleteMemory}
          onTouch={handleTouchMemory}
        />
      )}
      <ChatInput
        onSubmit={handleSubmit}
        onCancel={cancelTask}
        disabled={state.taskStatus === 'running'}
        availability={state.aiAvailability}
        value={inputPrompt}
        onChange={setInputPrompt}
        onRephrase={handleRephraseInput}
      />
      {state.pendingRoutine && state.showSaveRoutineModal && (
        <SaveRoutineModal
          defaultName={state.pendingRoutine.explanation.slice(0, 60)}
          onSave={handleSaveRoutine}
          onDismiss={() => dispatch({ type: 'SET_SHOW_SAVE_ROUTINE_MODAL', show: false })}
        />
      )}
      {state.showSettings && (
        <SettingsModal
          onClose={() => dispatch({ type: 'SET_SHOW_SETTINGS', show: false })}
          onSettingsChanged={handleSettingsChanged}
        />
      )}
    </div>
  )
}
