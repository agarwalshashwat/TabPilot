import { useEffect, useRef, useCallback } from 'react'
import type {
  ActionSelectionDebug,
  AIAvailability,
  VerificationStageStatus,
  Routine,
  SavedAction,
  TabAction,
  WorkerOutboundMessage,
  HistoryMessage,
} from '../../shared/types'

const DEBUG_LOGS = false
const LOG_PREFIX = '[TAP][sidepanel]'
const log = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(LOG_PREFIX, ...args)
}

// Subset of AppAction that this hook needs to dispatch.
// Defined here to avoid a circular import with App.tsx.
type HookDispatchAction =
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
  | { type: 'SET_TASK_SNAPSHOT'; explanation: string; actions: SavedAction[] }
  | { type: 'SET_REPHRASED_PROMPT'; prompt: string }

type DispatchFn = (action: HookDispatchAction) => void

export function useChromeMessages(dispatch: DispatchFn): {
  sendPrompt: (prompt: string, history?: HistoryMessage[]) => void
  cancelTask: () => void
  triggerDownload: () => void
  saveRoutine: (name: string, description: string, actions: SavedAction[]) => void
  deleteRoutine: (id: string) => void
  runRoutine: (id: string) => void
  notifySettingsChanged: () => void
  rephrasePrompt: (prompt: string) => void
} {
  const portRef = useRef<chrome.runtime.Port | null>(null)

  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'tabpilot' })
    portRef.current = port
    log('Port connected')

    // Ask the service worker for AI availability immediately.
    port.postMessage({ type: 'CHECK_AI' })
    log('Sent message', { type: 'CHECK_AI' })

    port.onMessage.addListener((rawMsg: unknown) => {
      const msg = rawMsg as WorkerOutboundMessage
      if (msg.type !== 'AI_STREAM_CHUNK') {
        log('Received message', { type: msg.type })
      }
      switch (msg.type) {
        case 'AI_AVAILABILITY':
          dispatch({
            type: 'SET_AI_AVAILABILITY',
            availability: msg.availability as AIAvailability,
          })
          break
        case 'AI_RESPONSE':
          dispatch({
            type: 'SET_AI_RESPONSE',
            explanation: msg.explanation,
            actions: msg.actions,
          })
          break
        case 'ASSISTANT_MESSAGE':
          dispatch({ type: 'SET_ASSISTANT_MESSAGE', content: msg.content })
          break
        case 'ACTION_PROGRESS':
          dispatch({
            type: 'UPDATE_ACTION_PROGRESS',
            index: msg.index,
            status: msg.status,
            error: msg.error,
            debug: msg.debug,
          })
          break
        case 'TASK_COMPLETE':
          dispatch({ type: 'SET_TASK_COMPLETE' })
          break
        case 'TASK_VERIFICATION':
          dispatch({
            type: 'SET_TASK_VERIFICATION',
            status: msg.status,
            attempt: msg.attempt,
            maxAttempts: msg.maxAttempts,
            reason: msg.reason,
          })
          break
        case 'TASK_ERROR':
          dispatch({ type: 'SET_TASK_ERROR', error: msg.error })
          break
        case 'DOWNLOAD_PROGRESS':
          dispatch({
            type: 'SET_DOWNLOAD_PROGRESS',
            loaded: msg.loaded,
            total: msg.total,
          })
          break
        case 'AI_THINKING':
          dispatch({ type: 'SET_AI_THINKING' })
          break
        case 'AI_STREAM_CHUNK':
          dispatch({ type: 'SET_THINKING_TEXT', text: msg.text })
          break
        case 'ROUTINES_LIST':
          dispatch({ type: 'SET_ROUTINES', routines: msg.routines })
          break
        case 'TASK_SNAPSHOT':
          dispatch({
            type: 'SET_TASK_SNAPSHOT',
            explanation: msg.explanation,
            actions: msg.actions,
          })
          break
        case 'REPHRASED_PROMPT':
          dispatch({ type: 'SET_REPHRASED_PROMPT', prompt: msg.prompt })
          break
      }
    })

    port.onDisconnect.addListener(() => {
      log('Port disconnected')
      portRef.current = null
    })

    return () => {
      port.disconnect()
      portRef.current = null
    }
  }, [dispatch])

  const sendPrompt = useCallback((prompt: string, history?: HistoryMessage[]) => {
    log('Sent message', { type: 'EXECUTE_PROMPT', prompt, historyCount: history?.length })
    portRef.current?.postMessage({ type: 'EXECUTE_PROMPT', prompt, history })
  }, [])

  const cancelTask = useCallback(() => {
    log('Sent message', { type: 'CANCEL_TASK' })
    portRef.current?.postMessage({ type: 'CANCEL_TASK' })
  }, [])

  const triggerDownload = useCallback(() => {
    log('Sent message', { type: 'TRIGGER_DOWNLOAD' })
    portRef.current?.postMessage({ type: 'TRIGGER_DOWNLOAD' })
  }, [])

  const saveRoutine = useCallback((name: string, description: string, actions: SavedAction[]) => {
    log('Sent message', { type: 'SAVE_ROUTINE', name, actionCount: actions.length })
    portRef.current?.postMessage({ type: 'SAVE_ROUTINE', name, description, actions })
  }, [])

  const deleteRoutine = useCallback((id: string) => {
    log('Sent message', { type: 'DELETE_ROUTINE', id })
    portRef.current?.postMessage({ type: 'DELETE_ROUTINE', id })
  }, [])

  const runRoutine = useCallback((id: string) => {
    log('Sent message', { type: 'RUN_ROUTINE', id })
    portRef.current?.postMessage({ type: 'RUN_ROUTINE', id })
  }, [])

  const notifySettingsChanged = useCallback(() => {
    log('Sent message', { type: 'SETTINGS_CHANGED' })
    portRef.current?.postMessage({ type: 'SETTINGS_CHANGED' })
  }, [])

  const rephrasePrompt = useCallback((prompt: string) => {
    log('Sent message', { type: 'REPHRASE_PROMPT', prompt })
    portRef.current?.postMessage({ type: 'REPHRASE_PROMPT', prompt })
  }, [])

  return {
    sendPrompt,
    cancelTask,
    triggerDownload,
    saveRoutine,
    deleteRoutine,
    runRoutine,
    notifySettingsChanged,
    rephrasePrompt,
  }
}
