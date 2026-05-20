import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  TabInfo,
  Routine,
} from '../shared/types'
import { checkAvailability, checkChromeAIAvailability, promptToActions, destroySession, rephraseUserPrompt } from './ai'
import { executeActions } from './executor'
import { loadRoutines, saveRoutine, deleteRoutine, resolveActions, snapshotActions } from './routines'
import { removeAllOverlays } from './overlay'

const DEBUG_LOGS = false
const LOG_PREFIX = '[TAP][worker]'
const log = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(LOG_PREFIX, ...args)
}
const warn = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.warn(LOG_PREFIX, ...args)
}
const error = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.error(LOG_PREFIX, ...args)
}

const STREAM_CHUNK_THROTTLE_MS = 150
const STREAM_CHUNK_MIN_DELTA_CHARS = 120

// ── Open the side panel when the extension toolbar icon is clicked ────────────
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => {
    error('Failed to set side panel behavior', err)
  })

// ── Per-connection task state ─────────────────────────────────────────────────
let currentAbortController: AbortController | null = null

// ── Port-based communication with the side panel ──────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'tab-ai-pilot') return

  log('Port connected', { name: port.name, sender: port.sender?.url })

  let isConnected = true
  const safePost = (message: WorkerOutboundMessage): boolean => {
    if (!isConnected) return false
    try {
      port.postMessage(message)
      if (message.type !== 'AI_STREAM_CHUNK') {
        log('Posted message', { type: message.type })
      }
      return true
    } catch (err) {
      // Happens when the sidepanel is closed or hot-reloaded while async work
      // is still in flight. Treat as a normal disconnect, not a fatal error.
      if (err instanceof Error && /disconnected port object/i.test(err.message)) {
        isConnected = false
        warn('Port disconnected while posting', { type: message.type })
        return false
      }
      error('Failed to post worker message', { type: message.type, err })
      return false
    }
  }

  port.onMessage.addListener(async (rawMsg: unknown) => {
    const msg = rawMsg as WorkerInboundMessage
    log('Received message', { type: msg.type })

    try {
      switch (msg.type) {
        // ── Check AI availability (Chrome Nano or external provider) ────────────
        case 'CHECK_AI': {
          const availability = await checkAvailability().catch(() => 'unavailable' as const)
          log('AI availability checked', { availability })
          safePost({ type: 'AI_AVAILABILITY', availability } satisfies WorkerOutboundMessage)
          // Also send routines so the panel loads them on open.
          const routines = await loadRoutines().catch(() => [])
          log('Loaded routines', { count: routines.length })
          safePost({ type: 'ROUTINES_LIST', routines } satisfies WorkerOutboundMessage)
          break
        }

        // ── Settings changed (re-check availability) ────────────────────────────
        case 'SETTINGS_CHANGED': {
          const availability = await checkAvailability().catch(() => 'unavailable' as const)
          log('Settings changed, refreshed availability', { availability })
          safePost({ type: 'AI_AVAILABILITY', availability } satisfies WorkerOutboundMessage)
          break
        }

        // ── Execute a natural-language prompt ───────────────────────────────────
        case 'EXECUTE_PROMPT': {
          log('EXECUTE_PROMPT start', { prompt: msg.prompt, historyCount: msg.history?.length })
          // Cancel any in-flight task first.
          currentAbortController?.abort()
          currentAbortController = new AbortController()
          const { signal } = currentAbortController

          try {
            const tabs = await getTabContext()
            const activeTab = tabs.find((t) => t.active)
            let latestStreamText = ''
            let lastPostedStreamTextLength = 0
            let lastPostedStreamAt = 0

            // Signal that the AI is about to start generating.
            safePost({ type: 'AI_THINKING' } satisfies WorkerOutboundMessage)

            const aiResponse = await promptToActions(
              msg.prompt,
              tabs,
              activeTab?.id ?? null,
              msg.history || [],
              (text) => {
                latestStreamText = text
                const now = Date.now()
                const delta = text.length - lastPostedStreamTextLength
                const shouldPost =
                  now - lastPostedStreamAt >= STREAM_CHUNK_THROTTLE_MS ||
                  delta >= STREAM_CHUNK_MIN_DELTA_CHARS
                if (!shouldPost) return

                safePost({
                  type: 'AI_STREAM_CHUNK',
                  text,
                } satisfies WorkerOutboundMessage)
                lastPostedStreamAt = now
                lastPostedStreamTextLength = text.length
              },
              signal,
            )

            if (latestStreamText.length > lastPostedStreamTextLength) {
              safePost({
                type: 'AI_STREAM_CHUNK',
                text: latestStreamText,
              } satisfies WorkerOutboundMessage)
            }

            log('AI produced action plan', {
              explanation: aiResponse.explanation,
              actionCount: aiResponse.actions.length,
            })

            const aiMsg: WorkerOutboundMessage = {
              type: 'AI_RESPONSE',
              explanation: aiResponse.explanation,
              actions: aiResponse.actions,
            }
            safePost(aiMsg)

            // Snapshot the actions (capture live tab URLs) so the UI can offer
            // "Save as Routine" with pre-filled SavedAction[] data.
            const savedActions = await snapshotActions(aiResponse.actions).catch(() => [])
            if (savedActions.length > 0) {
              safePost({
                type: 'TASK_SNAPSHOT',
                explanation: aiResponse.explanation,
                actions: savedActions,
              } satisfies WorkerOutboundMessage)
            }

            const result = await executeActions(
              aiResponse.actions,
              (progress) => {
                const progressMsg: WorkerOutboundMessage = {
                  type: 'ACTION_PROGRESS',
                  ...progress,
                }
                safePost(progressMsg)
              },
              signal,
            )

            log('Action execution complete', { pageContents: result.pageContents.length })

            if (result.pageContents.length > 0) {
              const followUp = buildPageContentSummary(result.pageContents)
              safePost({
                type: 'ASSISTANT_MESSAGE',
                content: followUp,
              } satisfies WorkerOutboundMessage)
            }

            safePost({ type: 'TASK_COMPLETE' } satisfies WorkerOutboundMessage)
            log('EXECUTE_PROMPT complete')
          } catch (err) {
            if ((err as Error).message === 'Task cancelled') return
            const errorMsg: WorkerOutboundMessage = {
              type: 'TASK_ERROR',
              error: err instanceof Error ? err.message : String(err),
            }
            safePost(errorMsg)
            error('EXECUTE_PROMPT failed', err)
          } finally {
            currentAbortController = null
          }
          break
        }

        // ── Cancel the running task ─────────────────────────────────────────────
        case 'CANCEL_TASK': {
          log('CANCEL_TASK received')
          currentAbortController?.abort()
          currentAbortController = null
          destroySession()
          // Best-effort: remove any lingering overlays from aborted actions.
          removeAllOverlays().catch((err) => {
            warn('Failed to remove overlays during cancel cleanup', err)
          })
          break
        }

        // ── Rephrase a natural language prompt ──────────────────────────────────
        case 'REPHRASE_PROMPT': {
          log('REPHRASE_PROMPT received', { prompt: msg.prompt })
          try {
            const rephrased = await rephraseUserPrompt(msg.prompt).catch((err) => {
              warn('rephraseUserPrompt failed, fallback to original', err)
              return msg.prompt
            })
            log('REPHRASE_PROMPT complete', { rephrased })
            safePost({ type: 'REPHRASED_PROMPT', prompt: rephrased } satisfies WorkerOutboundMessage)
          } catch {
            safePost({ type: 'REPHRASED_PROMPT', prompt: msg.prompt } satisfies WorkerOutboundMessage)
          }
          break
        }

        // ── List routines ───────────────────────────────────────────────────────
        case 'LIST_ROUTINES': {
          const routines = await loadRoutines().catch(() => [])
          log('LIST_ROUTINES', { count: routines.length })
          safePost({ type: 'ROUTINES_LIST', routines } satisfies WorkerOutboundMessage)
          break
        }

        // ── Save a routine ──────────────────────────────────────────────────────
        case 'SAVE_ROUTINE': {
          const routine: Routine = {
            id: crypto.randomUUID(),
            name: msg.name,
            description: msg.description,
            actions: msg.actions,
            createdAt: Date.now(),
          }
          await saveRoutine(routine).catch(console.error)
          const routines = await loadRoutines().catch(() => [])
          log('SAVE_ROUTINE complete', { routineName: msg.name, count: routines.length })
          safePost({ type: 'ROUTINES_LIST', routines } satisfies WorkerOutboundMessage)
          break
        }

        // ── Delete a routine ────────────────────────────────────────────────────
        case 'DELETE_ROUTINE': {
          await deleteRoutine(msg.id).catch(console.error)
          const routines = await loadRoutines().catch(() => [])
          log('DELETE_ROUTINE complete', { id: msg.id, count: routines.length })
          safePost({ type: 'ROUTINES_LIST', routines } satisfies WorkerOutboundMessage)
          break
        }

        // ── Run a routine ───────────────────────────────────────────────────────
        case 'RUN_ROUTINE': {
          log('RUN_ROUTINE start', { id: msg.id })
          currentAbortController?.abort()
          currentAbortController = new AbortController()
          const { signal } = currentAbortController

          try {
            const routines = await loadRoutines()
            const routine = routines.find((r) => r.id === msg.id)
            if (!routine) throw new Error(`Routine not found: ${msg.id}`)

            const resolvedActions = await resolveActions(routine.actions)
            log('Resolved routine actions', { count: resolvedActions.length, name: routine.name })

            // Show the routine description in the chat as an AI response.
            safePost({
              type: 'AI_RESPONSE',
              explanation: `Running routine: ${routine.name} — ${routine.description}`,
              actions: resolvedActions,
            } satisfies WorkerOutboundMessage)

            const result = await executeActions(
              resolvedActions,
              (progress) => {
                safePost({
                  type: 'ACTION_PROGRESS',
                  ...progress,
                } satisfies WorkerOutboundMessage)
              },
              signal,
            )

            if (result.pageContents.length > 0) {
              const followUp = buildPageContentSummary(result.pageContents)
              safePost({
                type: 'ASSISTANT_MESSAGE',
                content: followUp,
              } satisfies WorkerOutboundMessage)
            }

            safePost({ type: 'TASK_COMPLETE' } satisfies WorkerOutboundMessage)
            log('RUN_ROUTINE complete', { id: msg.id })
          } catch (err) {
            if ((err as Error).message === 'Task cancelled') return
            safePost({
              type: 'TASK_ERROR',
              error: err instanceof Error ? err.message : String(err),
            } satisfies WorkerOutboundMessage)
            error('RUN_ROUTINE failed', { id: msg.id, err })
          } finally {
            currentAbortController = null
          }
          break
        }

        // ── Trigger Gemini Nano download ────────────────────────────────────────
        case 'TRIGGER_DOWNLOAD': {
          log('TRIGGER_DOWNLOAD start')
          try {
            // Immediately report "downloading" so the UI updates.
            safePost({
              type: 'AI_AVAILABILITY',
              availability: 'downloading',
            } satisfies WorkerOutboundMessage)

            // LanguageModel.create() initiates the download and resolves when ready.
            // The monitor callback fires downloadprogress (ProgressEvent) while downloading.
            const s = await LanguageModel.create({
              monitor(m: EventTarget) {
                m.addEventListener('downloadprogress', (e: Event) => {
                  const pe = e as ProgressEvent
                  safePost({
                    type: 'DOWNLOAD_PROGRESS',
                    loaded: pe.loaded,
                    total: pe.total,
                  } satisfies WorkerOutboundMessage)
                })
              },
            })
            s.destroy() // getOrCreateSession will create a fresh session on first prompt.

            safePost({
              type: 'AI_AVAILABILITY',
              availability: 'available',
            } satisfies WorkerOutboundMessage)
            log('TRIGGER_DOWNLOAD complete')
          } catch {
            const availability = await checkChromeAIAvailability().catch(
              () => 'unavailable' as const,
            )
            safePost({
              type: 'AI_AVAILABILITY',
              availability,
            } satisfies WorkerOutboundMessage)
            warn('TRIGGER_DOWNLOAD fallback availability', { availability })
          }
          break
        }
      }
    } catch (err) {
      error('Unhandled worker message failure', { type: msg.type, err })
      safePost({
        type: 'TASK_ERROR',
        error: err instanceof Error ? err.message : String(err),
      } satisfies WorkerOutboundMessage)
    }
  })

  port.onDisconnect.addListener(() => {
    isConnected = false
    currentAbortController?.abort()
    currentAbortController = null
    log('Port disconnected')
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getTabContext(): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({})
  return tabs
    .filter((t) => t.id !== undefined)
    .map((t) => ({
      id: t.id!,
      url: t.url ?? '',
      title: t.title ?? '',
      active: t.active,
    }))
}

function buildPageContentSummary(pageContents: string[]): string {
  const items = pageContents
    .map((content) => {
      const lines = content.split('\n')
      const title = lines.find((l) => l.startsWith('Title:'))?.replace('Title:', '').trim()
      const url = lines.find((l) => l.startsWith('URL:'))?.replace('URL:', '').trim()
      const body = (content.split('\n\n')[1] ?? '').replace(/\s+/g, ' ').trim()
      const snippet = body.slice(0, 260)
      const suffix = body.length > snippet.length ? '...' : ''

      const parts: string[] = []
      if (title) parts.push(`Title: ${title}.`)
      if (url) parts.push(`URL: ${url}.`)
      if (snippet) parts.push(`Summary: ${snippet}${suffix}`)
      return parts.join(' ')
    })
    .filter(Boolean)

  if (items.length === 0) {
    return 'I read the page content, but could not extract a useful summary.'
  }

  if (items.length === 1) {
    return `Here is what I found. ${items[0]}`
  }

  const joined = items.map((item, index) => `(${index + 1}) ${item}`).join(' ')
  return `Here is what I found across the pages. ${joined}`
}
