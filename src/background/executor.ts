import type { ActionProgressMessage, ActionSelectionDebug, TabAction } from '../shared/types'
import { injectOverlay, removeOverlay } from './overlay'

const DEBUG_LOGS = true
const LOG_PREFIX = '[TAP][executor]'
const log = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(LOG_PREFIX, ...args)
}
const warn = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.warn(LOG_PREFIX, ...args)
}

const SELECTION_POLICY = {
  mode: 'hybrid' as 'hybrid' | 'selector',
  maxAttempts: 3,
  minSemanticScore: 90,
}

// ── DOM helpers injected into pages via chrome.scripting.executeScript ────────
// These functions run in the page's ISOLATED world. They must be self-contained:
// no imports, no references to the extension's outer scope.

function domClick(selector: string): {
  success: boolean
  error?: string
  picked?: string
  score?: number
  candidates?: number
  directMatch?: boolean
} {
  type Ranked = {
    el: HTMLElement
    score: number
    selector: string
    reasons: string[]
    directMatch: boolean
  }

  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[_#.[\](){}>:+~*="'`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const toTerms = (value: string): string[] =>
    normalize(value)
      .split(' ')
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)

  const isVisible = (el: HTMLElement): boolean => {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  const isEnabled = (el: HTMLElement): boolean => {
    const disabledLike =
      (el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true'
    return !disabledLike
  }

  const cssEscape = (text: string): string => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text)
    return text.replace(/["\\]/g, '\\$&')
  }

  const buildSelector = (el: HTMLElement): string => {
    if (el.id) return `#${cssEscape(el.id)}`
    const testId = el.getAttribute('data-testid')
    if (testId) return `[data-testid="${cssEscape(testId)}"]`
    const name = el.getAttribute('name')
    if (name) return `${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`
    const aria = el.getAttribute('aria-label')
    if (aria) return `${el.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`

    const parent = el.parentElement
    if (!parent) return el.tagName.toLowerCase()
    const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName)
    const index = siblings.indexOf(el) + 1
    return `${el.tagName.toLowerCase()}:nth-of-type(${index})`
  }

  const readText = (el: HTMLElement): string => {
    const chunks = [
      el.innerText,
      el.getAttribute('aria-label') ?? '',
      el.getAttribute('title') ?? '',
      el.getAttribute('name') ?? '',
      el.getAttribute('id') ?? '',
      el.getAttribute('data-testid') ?? '',
    ]
    return normalize(chunks.filter(Boolean).join(' '))
  }

  const raw = selector.trim()
  if (!raw) return { success: false, error: 'Empty selector' }

  const terms = toTerms(raw)
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(
      'a, button, [role="button"], input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], label, summary, [onclick], [data-testid], [aria-label]'
    )
  )

  const ranked: Ranked[] = nodes
    .map((el) => {
      let score = 0
      const reasons: string[] = []
      let directMatch = false

      try {
        if (el.matches(raw)) {
          score += 160
          reasons.push('selector-match')
          directMatch = true
        }
      } catch {
        // Ignore invalid selectors; semantic scoring can still find a target.
      }

      const haystack = readText(el)
      if (terms.length > 0) {
        const matches = terms.filter((term) => haystack.includes(term)).length
        if (matches > 0) {
          score += matches * 24
          reasons.push(`term-match:${matches}`)
        }
      }

      if (isVisible(el)) {
        score += 30
        reasons.push('visible')
      } else {
        score -= 120
      }

      if (isEnabled(el)) {
        score += 20
      } else {
        score -= 80
      }

      const tag = el.tagName.toLowerCase()
      if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
        score += 20
      }

      const rect = el.getBoundingClientRect()
      const inViewport =
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= window.innerHeight &&
        rect.left <= window.innerWidth
      if (inViewport) score += 12

      return { el, score, selector: buildSelector(el), reasons, directMatch }
    })
    .sort((a, b) => b.score - a.score)

  const top = ranked.slice(0, 5)
  for (const candidate of top) {
    if (candidate.score < 20) continue
    candidate.el.scrollIntoView({ block: 'center', behavior: 'auto' })
    candidate.el.focus({ preventScroll: true })
    candidate.el.click()
    return {
      success: true,
      picked: candidate.selector,
      score: candidate.score,
      candidates: ranked.length,
      directMatch: candidate.directMatch,
    }
  }

  return {
    success: false,
    error:
      ranked.length > 0
        ? `Could not find a reliable match for "${selector}". Found ${ranked.length} candidates, but none were sufficiently relevant or clickable.`
        : `No elements matching "${selector}" were found on the page.`,
    candidates: ranked.length,
  }
}

function domFill(
  selector: string,
  value: string
): {
  success: boolean
  error?: string
  picked?: string
  score?: number
  candidates?: number
  directMatch?: boolean
} {
  type InputLike = HTMLInputElement | HTMLTextAreaElement
  type Ranked = { el: InputLike; score: number; selector: string; directMatch: boolean }

  const normalize = (text: string): string =>
    text
      .toLowerCase()
      .replace(/[_#.[\](){}>:+~*="'`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const toTerms = (text: string): string[] =>
    normalize(text)
      .split(' ')
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)

  const isVisible = (el: HTMLElement): boolean => {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  const cssEscape = (text: string): string => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text)
    return text.replace(/["\\]/g, '\\$&')
  }

  const buildSelector = (el: InputLike): string => {
    if (el.id) return `#${cssEscape(el.id)}`
    const name = el.getAttribute('name')
    if (name) return `${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`
    const placeholder = el.getAttribute('placeholder')
    if (placeholder) return `${el.tagName.toLowerCase()}[placeholder="${cssEscape(placeholder)}"]`
    const aria = el.getAttribute('aria-label')
    if (aria) return `${el.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`
    return el.tagName.toLowerCase()
  }

  const readLabelText = (el: InputLike): string => {
    const direct = el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? ''
    if (direct) return direct

    const id = el.getAttribute('id')
    if (id) {
      const label = document.querySelector(`label[for="${cssEscape(id)}"]`)
      if (label?.textContent) return label.textContent
    }

    const parentLabel = el.closest('label')
    if (parentLabel?.textContent) return parentLabel.textContent
    return ''
  }

  const raw = selector.trim()
  if (!raw) return { success: false, error: 'Empty selector' }

  const terms = toTerms(raw)
  const allInputs = Array.from(document.querySelectorAll<InputLike>('input, textarea')).filter(
    (el) => {
      if (el instanceof HTMLInputElement) {
        const disallowed = ['hidden', 'submit', 'button', 'radio', 'checkbox', 'file', 'image']
        return !disallowed.includes(el.type)
      }
      return true
    }
  )

  const ranked: Ranked[] = allInputs
    .map((el) => {
      let score = 0
      let directMatch = false
      try {
        if (el.matches(raw)) {
          score += 180
          directMatch = true
        }
      } catch {
        // Ignore invalid selector syntax.
      }

      const haystack = normalize(
        [
          el.getAttribute('name') ?? '',
          el.getAttribute('id') ?? '',
          el.getAttribute('placeholder') ?? '',
          el.getAttribute('aria-label') ?? '',
          readLabelText(el),
        ].join(' ')
      )
      if (terms.length > 0) {
        const matches = terms.filter((term) => haystack.includes(term)).length
        score += matches * 26
      }

      if (isVisible(el)) score += 30
      else score -= 120

      if (!el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.readOnly) {
        score += 25
      } else {
        score -= 90
      }

      return { el, score, selector: buildSelector(el), directMatch }
    })
    .sort((a, b) => b.score - a.score)

  const top = ranked.slice(0, 5)
  let target: InputLike | null = null
  let chosen: Ranked | null = null
  for (const candidate of top) {
    if (candidate.score < 20) continue
    target = candidate.el
    chosen = candidate
    break
  }

  if (!target || !chosen) {
    return {
      success: false,
      error:
        ranked.length > 0
          ? `Could not find a reliable input field for "${selector}". Found ${ranked.length} candidates, but none were sufficiently relevant.`
          : `No input fields matching "${selector}" were found on the page.`,
      candidates: ranked.length,
    }
  }

  target.scrollIntoView({ block: 'center', behavior: 'auto' })
  target.focus({ preventScroll: true })

  const proto =
    target instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  nativeSetter?.call(target, value)
  target.dispatchEvent(new Event('input', { bubbles: true }))
  target.dispatchEvent(new Event('change', { bubbles: true }))

  return {
    success: true,
    picked: chosen.selector,
    score: chosen.score,
    candidates: ranked.length,
    directMatch: chosen.directMatch,
  }
}

function domGetContent(): string {
  const text = document.body?.innerText ?? ''
  return `Title: ${document.title}\nURL: ${location.href}\n\n${text.slice(0, 4000)}`
}

function domScroll(direction: 'up' | 'down', pixels: number): { success: boolean } {
  const amount = direction === 'down' ? pixels : -pixels
  window.scrollBy({ top: amount, behavior: 'smooth' })
  return { success: true }
}

interface DomActionResult {
  success: boolean
  error?: string
  picked?: string
  score?: number
  candidates?: number
  directMatch?: boolean
  attempts?: Array<{
    attempt: number
    success: boolean
    picked?: string
    score?: number
    candidates?: number
    directMatch?: boolean
    error?: string
  }>
}

interface RunActionResult {
  pageContent: string | null
  debug?: ActionSelectionDebug
}

function buildActionQuery(
  action: Extract<TabAction, { type: 'clickElement' | 'fillForm' }>
): string {
  const parts = [action.selector]
  if (action.descriptor?.label) parts.push(action.descriptor.label)
  if (action.descriptor?.intent) parts.push(action.descriptor.intent)
  if (action.descriptor?.role) parts.push(action.descriptor.role)
  return parts.filter(Boolean).join(' ')
}

function toSelectionDebug(query: string, result: DomActionResult): ActionSelectionDebug {
  return {
    query,
    attempts: result.attempts ?? [],
    selected: result.success
      ? {
          picked: result.picked,
          score: result.score,
          candidates: result.candidates,
        }
      : undefined,
  }
}

async function executeDomActionWithRetries<T extends unknown[]>(
  tabId: number,
  actionType: 'clickElement' | 'fillForm',
  func: (...args: T) => DomActionResult,
  args: T,
  maxAttempts = SELECTION_POLICY.maxAttempts
): Promise<DomActionResult> {
  let last: DomActionResult = { success: false, error: 'Unknown DOM failure' }
  const attempts: NonNullable<DomActionResult['attempts']> = []

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await chrome.scripting.executeScript<T, DomActionResult>({
      target: { tabId },
      func,
      args,
    })
    const current = res[0]?.result ?? { success: false, error: 'No script result returned' }
    last = current

    attempts.push({
      attempt,
      success: current.success,
      picked: current.picked,
      score: current.score,
      candidates: current.candidates,
      directMatch: current.directMatch,
      error: current.error,
    })

    log(`${actionType} attempt`, {
      attempt,
      success: current.success,
      picked: current.picked,
      score: current.score,
      candidates: current.candidates,
      error: current.error,
    })

    if (current.success) return { ...current, attempts }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 220 * attempt))
    }
  }

  return { ...last, attempts }
}

function isConfidentSelection(result: DomActionResult): boolean {
  if (!result.success) return false
  if (result.directMatch) return true
  const score = result.score ?? 0
  return score >= SELECTION_POLICY.minSemanticScore
}

async function executeWithPolicy<T extends unknown[]>(
  tabId: number,
  actionType: 'clickElement' | 'fillForm',
  func: (...args: T) => DomActionResult,
  semanticArgs: T,
  selectorArgs: T
): Promise<{ result: DomActionResult; mode: ActionSelectionDebug['mode']; fallbackUsed: boolean }> {
  if (SELECTION_POLICY.mode === 'selector') {
    const selectorResult = await executeDomActionWithRetries(tabId, actionType, func, selectorArgs)
    return { result: selectorResult, mode: 'selector', fallbackUsed: false }
  }

  const semanticResult = await executeDomActionWithRetries(tabId, actionType, func, semanticArgs)

  if (isConfidentSelection(semanticResult)) {
    return { result: semanticResult, mode: 'hybrid', fallbackUsed: false }
  }

  warn('Low-confidence semantic selection, falling back to selector', {
    actionType,
    score: semanticResult.score,
    directMatch: semanticResult.directMatch,
    success: semanticResult.success,
  })

  const selectorResult = await executeDomActionWithRetries(tabId, actionType, func, selectorArgs)

  const attempts = [
    ...(semanticResult.attempts ?? []),
    ...(selectorResult.attempts ?? []).map((a) => ({
      ...a,
      attempt: (semanticResult.attempts?.length ?? 0) + a.attempt,
    })),
  ]

  return {
    result: {
      ...selectorResult,
      attempts,
    },
    mode: 'hybrid',
    fallbackUsed: true,
  }
}

// ── Executor ──────────────────────────────────────────────────────────────────

type ProgressCallback = (progress: Omit<ActionProgressMessage, 'type'>) => void

export interface ExecuteActionsResult {
  pageContents: string[]
}

export async function executeActions(
  actions: TabAction[],
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<ExecuteActionsResult> {
  log('executeActions start', { actionCount: actions.length })
  // Track which tabs got an overlay so we can clean up on any exit path.
  const overlaidTabs = new Set<number>()
  // Track the most recently opened tab so we can remap stale tabIds.
  let lastOpenedTabId: number | null = null
  const pageContents: string[] = []

  try {
    for (let i = 0; i < actions.length; i++) {
      if (signal?.aborted) throw new Error('Task cancelled')

      let action = actions[i]
      log('Action begin', { index: i, type: action.type, action })

      // Remap tabId to the most recently opened tab when the referenced tab
      // is not scriptable (e.g. AI used the old active-tab ID after openTab).
      if ('tabId' in action && lastOpenedTabId != null) {
        const needsRemap = await shouldRemapTabId(
          (action as { tabId: number }).tabId,
          lastOpenedTabId
        )
        if (needsRemap) {
          log('Remapping tabId', {
            index: i,
            from: (action as { tabId: number }).tabId,
            to: lastOpenedTabId,
          })
          action = { ...action, tabId: lastOpenedTabId } as TabAction
        }
      }

      onProgress({ index: i, total: actions.length, action, status: 'running' })

      try {
        const result = await runAction(action, signal, overlaidTabs, (tabId) => {
          lastOpenedTabId = tabId
        })
        const pageContent = result.pageContent
        if (typeof pageContent === 'string' && pageContent.trim()) {
          pageContents.push(pageContent)
        }
        onProgress({ index: i, total: actions.length, action, status: 'done', debug: result.debug })
        log('Action done', { index: i, type: action.type })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const debug = (err as { debug?: ActionSelectionDebug })?.debug
        onProgress({
          index: i,
          total: actions.length,
          action,
          status: 'error',
          error: errorMsg,
          debug,
        })
        warn('Action failed', { index: i, type: action.type, error: errorMsg })

        // Attach action context to the error so the worker can provide feedback to AI.
        const wrappedError = new Error(errorMsg) as Error & {
          action?: TabAction
          debug?: ActionSelectionDebug
        }
        wrappedError.action = action
        wrappedError.debug = debug
        throw wrappedError
      }
    }
  } finally {
    // Always remove overlays regardless of success / error / cancel.
    log('Cleaning overlays', { count: overlaidTabs.size })
    await Promise.allSettled([...overlaidTabs].map(removeOverlay))
  }

  log('executeActions complete', { pageContents: pageContents.length })
  return { pageContents }
}

async function runAction(
  action: TabAction,
  signal?: AbortSignal,
  overlaidTabs?: Set<number>,
  onOpenedTab?: (tabId: number) => void
): Promise<RunActionResult> {
  switch (action.type) {
    case 'openTab': {
      if (!action.url) throw new Error('openTab action missing url')
      const tab = await chrome.tabs.create({ url: sanitizeUrl(action.url) })
      // Wait for the tab to finish loading so subsequent actions can script it.
      if (tab.id != null) {
        await waitForTabLoad(tab.id, signal)
        onOpenedTab?.(tab.id)

        // Post-load diagnostic: check for obvious error states like 404s.
        try {
          const scriptResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const txt = document.body.innerText.toLowerCase()
              const tit = document.title.toLowerCase()
              const isFourOhFour =
                tit.includes('404') ||
                tit.includes('not found') ||
                (txt.includes('404') && txt.length < 1000)
              return isFourOhFour ? '404' : 'ok'
            },
          })
          if (scriptResult?.[0]?.result === '404') {
            throw new Error(`The page at ${action.url} returned a 404 Not Found error.`)
          }
        } catch {
          // Ignore errors during diagnostic.
        }
      }
      return { pageContent: null }
    }

    case 'closeTab':
      await chrome.tabs.remove(action.tabId)
      return { pageContent: null }

    case 'switchTab':
      await chrome.tabs.update(action.tabId, { active: true })
      return { pageContent: null }

    case 'navigateTo': {
      if (!action.url) throw new Error('navigateTo action missing url')
      await chrome.tabs.update(action.tabId, { url: sanitizeUrl(action.url) })
      await waitForTabLoad(action.tabId, signal)

      // Post-load diagnostic: check for obvious error states like 404s.
      try {
        const scriptResult = await chrome.scripting.executeScript({
          target: { tabId: action.tabId },
          func: () => {
            const txt = document.body.innerText.toLowerCase()
            const tit = document.title.toLowerCase()
            const isFourOhFour =
              tit.includes('404') ||
              tit.includes('not found') ||
              (txt.includes('404') && txt.length < 1000)
            return isFourOhFour ? '404' : 'ok'
          },
        })
        if (scriptResult?.[0]?.result === '404') {
          throw new Error(`The page at ${action.url} returned a 404 Not Found error.`)
        }
      } catch {
        // Ignore errors during diagnostic; scriptability issues are handled by waitForTabLoad.
      }
      return { pageContent: null }
    }

    case 'clickElement': {
      await waitForTabLoad(action.tabId, signal)
      await injectOverlay(action.tabId)
      overlaidTabs?.add(action.tabId)
      const query = buildActionQuery(action)
      const execution = await executeWithPolicy(
        action.tabId,
        'clickElement',
        domClick,
        [query],
        [action.selector]
      )
      const r = execution.result
      const debug = toSelectionDebug(query, r)
      debug.mode = execution.mode
      debug.fallbackUsed = execution.fallbackUsed
      if (r && !r.success) {
        const err = new Error(r.error ?? 'Click failed') as Error & { debug?: ActionSelectionDebug }
        err.debug = debug
        throw err
      }
      return { pageContent: null, debug }
    }

    case 'fillForm': {
      await waitForTabLoad(action.tabId, signal)
      await injectOverlay(action.tabId)
      overlaidTabs?.add(action.tabId)
      const query = buildActionQuery(action)
      const execution = await executeWithPolicy(
        action.tabId,
        'fillForm',
        domFill,
        [query, action.value],
        [action.selector, action.value]
      )
      const r = execution.result
      const debug = toSelectionDebug(query, r)
      debug.mode = execution.mode
      debug.fallbackUsed = execution.fallbackUsed
      if (r && !r.success) {
        const err = new Error(r.error ?? 'Fill failed') as Error & { debug?: ActionSelectionDebug }
        err.debug = debug
        throw err
      }
      return { pageContent: null, debug }
    }

    case 'getPageContent': {
      await waitForTabLoad(action.tabId, signal)
      await injectOverlay(action.tabId)
      overlaidTabs?.add(action.tabId)
      const result = await chrome.scripting.executeScript<[], string>({
        target: { tabId: action.tabId },
        func: domGetContent,
      })
      return { pageContent: result[0]?.result ?? '' }
    }

    case 'groupTabs': {
      // @types/chrome requires a non-empty tuple for tabIds.
      const tabIds = action.tabIds as [number, ...number[]]
      const groupId = await (chrome.tabs.group({ tabIds }) as Promise<number>)
      if (action.title) {
        await chrome.tabGroups.update(groupId, { title: action.title })
      }
      return { pageContent: null }
    }

    case 'waitMs':
      // Cap at 10 s to prevent runaway waits.
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(action.ms, 10_000)))
      return { pageContent: null }

    case 'scroll': {
      await waitForTabLoad(action.tabId, signal)
      await chrome.scripting.executeScript({
        target: { tabId: action.tabId },
        func: domScroll,
        args: [action.direction, action.pixels],
      })
      // Smooth scrolling takes a moment; brief pause to let it finish.
      await new Promise((resolve) => setTimeout(resolve, 800))
      return { pageContent: null }
    }

    default:
      throw new Error(`Unsupported action type: ${(action as { type?: string }).type ?? 'unknown'}`)
  }
}

// ── Tab ID remapping ──────────────────────────────────────────────────────────
// Returns true when the given tabId should be replaced with lastOpenedTabId.
// This happens when the AI used the old active-tab ID after an openTab action.
async function shouldRemapTabId(tabId: number, lastOpenedTabId: number): Promise<boolean> {
  if (tabId === lastOpenedTabId) return false
  try {
    const tab = await chrome.tabs.get(tabId)
    // Remap if the referenced tab is already loaded on a non-scriptable URL.
    return tab.status === 'complete' && !isScriptable(tab)
  } catch {
    // Tab no longer exists — remap to lastOpenedTabId.
    return true
  }
}

// ── Tab load helper ───────────────────────────────────────────────────────────
// Waits until the given tab has status 'complete' and its URL is scriptable
// (http/https). Resolves immediately if the tab is already loaded.
// Throws immediately (rather than timing out) if the tab is already loaded
// but on a non-scriptable URL (e.g. chrome://newtab) — this avoids the 15s
// hang when the AI references the wrong tab after an openTab action.
// Times out after 15 s for tabs that are genuinely still loading.
function waitForTabLoad(tabId: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const TIMEOUT_MS = 15_000
    log('Waiting for tab load', { tabId })

    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (isScriptable(tab)) {
          resolve()
          return
        }

        // Tab is fully loaded but on a non-scriptable URL — fail fast.
        if (tab.status === 'complete') {
          reject(
            new Error(
              `Tab ${tabId} is loaded but cannot be scripted (URL: ${tab.url ?? 'unknown'}). ` +
                `If you just opened a new tab, the AI may have used the wrong tab ID.`
            )
          )
          return
        }

        const timer = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener)
          warn('Tab load timeout', { tabId, timeoutMs: TIMEOUT_MS })
          reject(new Error(`Timed out waiting for tab ${tabId} to load`))
        }, TIMEOUT_MS)

        function listener(
          updatedId: number,
          _info: chrome.tabs.OnUpdatedInfo,
          updatedTab: chrome.tabs.Tab
        ) {
          if (updatedId !== tabId) return
          if (isScriptable(updatedTab)) {
            clearTimeout(timer)
            chrome.tabs.onUpdated.removeListener(listener)
            resolve()
          }
        }

        if (signal?.aborted) {
          clearTimeout(timer)
          reject(new Error('Task cancelled'))
          return
        }
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          chrome.tabs.onUpdated.removeListener(listener)
          reject(new Error('Task cancelled'))
        })

        chrome.tabs.onUpdated.addListener(listener)
      })
      .catch(reject)
  })
}

function isScriptable(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? ''
  return tab.status === 'complete' && (url.startsWith('http://') || url.startsWith('https://'))
}

// ── URL sanitisation ──────────────────────────────────────────────────────────
// Prevents javascript: / data: injection via LLM-generated URLs.
function sanitizeUrl(url: string | undefined): string {
  if (!url || typeof url !== 'string') throw new Error('Missing or invalid URL in action')
  try {
    const parsed = new URL(url)
    const allowed = ['http:', 'https:', 'chrome:', 'about:']
    if (!allowed.includes(parsed.protocol)) {
      throw new Error(`Blocked URL scheme: ${parsed.protocol}`)
    }
    return parsed.href
  } catch {
    // Treat as a bare hostname — prepend https://.
    if (!url.startsWith('http')) return `https://${url}`
    throw new Error(`Invalid URL: ${url}`)
  }
}
