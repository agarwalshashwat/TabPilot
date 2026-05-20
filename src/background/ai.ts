import type {
  AIResponse,
  AIAvailability,
  AISettings,
  AgentMemory,
  ElementDescriptor,
  TabInfo,
  TabAction,
  HistoryMessage,
} from '../shared/types'
import { getSettings } from './settings'

const DEBUG_LOGS = false
const LOG_PREFIX = '[TAP][ai]'
const log = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(LOG_PREFIX, ...args)
}
const warn = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.warn(LOG_PREFIX, ...args)
}

// ── JSON Schema for responseConstraint ───────────────────────────────────────
// Permissive schema: all action fields are optional properties; the "type"
// discriminant is the only required field per action item.
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['explanation', 'actions'],
  properties: {
    explanation: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'openTab',
              'closeTab',
              'switchTab',
              'navigateTo',
              'clickElement',
              'fillForm',
              'getPageContent',
              'groupTabs',
              'waitMs',
              'scroll',
            ],
          },
          url: { type: 'string' },
          tabId: { type: 'number' },
          tabIds: { type: 'array', items: { type: 'number' } },
          selector: { type: 'string' },
          value: { type: 'string' },
          title: { type: 'string' },
          ms: { type: 'number' },
          direction: { type: 'string', enum: ['up', 'down'] },
          pixels: { type: 'number' },
          descriptor: {
            type: 'object',
            additionalProperties: false,
            properties: {
              intent: { type: 'string' },
              label: { type: 'string' },
              role: { type: 'string' },
            },
          },
        },
      },
    },
  },
}

// ── System prompt (shared across all providers) ───────────────────────────────
const SYSTEM_PROMPT = `You are a browser tab automation agent. Output ONLY a JSON object — no markdown.
Schema: {"explanation":"string","actions":[...]}
Actions: openTab(url), closeTab(tabId), switchTab(tabId), navigateTo(tabId,url), clickElement(tabId,selector), fillForm(tabId,selector,value), getPageContent(tabId), groupTabs(tabIds,title?), waitMs(ms), scroll(tabId,direction,pixels).
Rules:
- Keep explanation to 1 short sentence.
- Only use tabIds from the provided list.
- Every action must include all required fields for that action type.
- For openTab and navigateTo, always provide a fully-qualified https:// URL.
- For scroll, use direction "up" or "down" and pixels (number).
- If request is vague or a greeting, set actions:[] and ask for clarification.
- Never touch the active tab unless explicitly asked.
- Never invent actions not requested.
- For clickElement/fillForm, use modern stable selectors (id/name/aria-label/placeholder/data-testid) and avoid brittle class chains.
- Prefer selectors that represent user-visible intent (labels, roles, named fields, action buttons) over presentation-only classes.
- For clickElement/fillForm, you may add descriptor:{intent,label,role} to express user intent for robust element ranking.`

const ACTION_TYPE_ALIASES: Record<string, TabAction['type']> = {
  opentab: 'openTab',
  open_tab: 'openTab',
  opennewtab: 'openTab',
  open_new_tab: 'openTab',
  closetab: 'closeTab',
  close_tab: 'closeTab',
  switchtab: 'switchTab',
  switch_tab: 'switchTab',
  navigateto: 'navigateTo',
  navigate_to: 'navigateTo',
  click: 'clickElement',
  clickelement: 'clickElement',
  click_element: 'clickElement',
  fill: 'fillForm',
  fillform: 'fillForm',
  fill_form: 'fillForm',
  getpagecontent: 'getPageContent',
  get_page_content: 'getPageContent',
  readpagecontent: 'getPageContent',
  read_page_content: 'getPageContent',
  grouptabs: 'groupTabs',
  group_tabs: 'groupTabs',
  wait: 'waitMs',
  waitms: 'waitMs',
  wait_ms: 'waitMs',
  scroll: 'scroll',
  scrolldown: 'scroll',
  scrolleddown: 'scroll',
  scrollup: 'scroll',
  scrolledup: 'scroll',
}

const AGENT_MEMORIES_KEY = 'agent_memories'
const AGENT_MEMORIES_CAPACITY = 50

function normalizeActionType(value: unknown): TabAction['type'] | null {
  if (typeof value !== 'string') return null
  const compact = value.replace(/[\s-]/g, '').toLowerCase()
  return ACTION_TYPE_ALIASES[compact] ?? null
}

async function loadAgentMemories(): Promise<AgentMemory[]> {
  const result = await chrome.storage.local.get(AGENT_MEMORIES_KEY)
  const raw = result[AGENT_MEMORIES_KEY] as unknown
  if (!Array.isArray(raw)) return []

  const normalized = raw
    .map((item): AgentMemory | null => {
      if (!item || typeof item !== 'object') return null
      const value = item as Partial<AgentMemory>
      if (typeof value.id !== 'string' || typeof value.text !== 'string') return null
      if (typeof value.createdAt !== 'number') return null
      const lastAccessedAt =
        typeof value.lastAccessedAt === 'number' ? value.lastAccessedAt : value.createdAt
      return {
        id: value.id,
        text: value.text,
        createdAt: value.createdAt,
        lastAccessedAt,
      }
    })
    .filter((m): m is AgentMemory => m != null)

  return normalized
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, AGENT_MEMORIES_CAPACITY)
}

async function refreshMemoriesOnInjection(memories: AgentMemory[]): Promise<AgentMemory[]> {
  if (memories.length === 0) return memories
  const now = Date.now()
  const refreshed = memories
    .map((m) => ({ ...m, lastAccessedAt: now }))
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, AGENT_MEMORIES_CAPACITY)

  await chrome.storage.local.set({ [AGENT_MEMORIES_KEY]: refreshed })
  return refreshed
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function deriveSearchQuery(prompt: string): string {
  const text = prompt.trim()
  if (!text) return ''

  const stripWrapper = (value: string): string =>
    value
      .trim()
      .replace(/^['"`]+|['"`]+$/g, '')
      .trim()

  const normalizeIntentFragment = (value: string): string =>
    stripWrapper(value)
      .replace(
        /^(open\s+(a\s+)?new\s+tab(\s+with)?|go\s+to|navigate\s+to|search(\s+for)?|find)\s+/i,
        ''
      )
      .replace(/^(click\s+on\s+|click\s+)/i, '')
      .replace(/\b(first|second|third)\b\s+video\b/i, '')
      .replace(/\s+/g, ' ')
      .trim()

  const chainedParts = text
    .split(/\s*->\s*|\bthen\b|\n+/i)
    .map(normalizeIntentFragment)
    .filter(Boolean)

  const stopPhrases = [/^open\s+(a\s+)?new\s+tab/i, /^click\b/i, /^with\s+youtube$/i, /^youtube$/i]

  const candidates = (
    chainedParts.length > 0 ? chainedParts : [normalizeIntentFragment(text)]
  ).filter((part) => !stopPhrases.some((re) => re.test(part)))

  if (candidates.length === 0) return text
  return candidates.sort((a, b) => b.length - a.length)[0]
}

function buildSearchUrl(query: string): string {
  const q = deriveSearchQuery(query)
  if (!q) return 'https://www.google.com'
  if (/youtube|video|watch/i.test(q)) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

function shouldCoerceYouTubeWatchToSearch(url: string, userPrompt: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const isYouTubeHost =
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be'
    if (!isYouTubeHost) return false

    const isDirectWatch = parsed.pathname === '/watch' || host === 'youtu.be'
    if (!isDirectWatch) return false

    // If the user explicitly provided a concrete video URL, respect it.
    const promptHasConcreteVideoUrl =
      /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?|youtu\.be\/)/i.test(userPrompt)
    if (promptHasConcreteVideoUrl) return false

    return true
  } catch {
    return false
  }
}

function readDescriptor(value: unknown): ElementDescriptor | undefined {
  if (!value || typeof value !== 'object') return undefined
  const descriptor = value as Record<string, unknown>
  const intent = typeof descriptor.intent === 'string' ? descriptor.intent.trim() : ''
  const label = typeof descriptor.label === 'string' ? descriptor.label.trim() : ''
  const role = typeof descriptor.role === 'string' ? descriptor.role.trim() : ''
  if (!intent && !label && !role) return undefined
  return {
    ...(intent ? { intent } : {}),
    ...(label ? { label } : {}),
    ...(role ? { role } : {}),
  }
}

function normalizeAndValidateResponse(
  raw: { explanation?: unknown; actions?: unknown[] },
  userPrompt: string,
  activeTabId: number | null
): AIResponse {
  const explanation =
    typeof raw.explanation === 'string' && raw.explanation.trim()
      ? raw.explanation.trim()
      : 'Executing your request.'

  if (!Array.isArray(raw.actions)) {
    return { explanation, actions: [] }
  }

  const normalized: TabAction[] = raw.actions.map((actionRaw, index) => {
    const action = actionRaw as Record<string, unknown>
    const type = normalizeActionType(action?.type)
    if (!type) {
      throw new Error(`Unsupported action type: ${String(action?.type ?? 'unknown')}`)
    }

    switch (type) {
      case 'openTab': {
        const rawUrl =
          typeof action.url === 'string' && action.url.trim()
            ? action.url.trim()
            : buildSearchUrl(userPrompt)
        const url = shouldCoerceYouTubeWatchToSearch(rawUrl, userPrompt)
          ? buildSearchUrl(userPrompt)
          : rawUrl
        return { type, url }
      }

      case 'navigateTo': {
        const tabId = readNumber(action.tabId) ?? activeTabId
        if (tabId == null) {
          throw new Error(`navigateTo action missing tabId at index ${index}`)
        }
        const rawUrl =
          typeof action.url === 'string' && action.url.trim()
            ? action.url.trim()
            : buildSearchUrl(userPrompt)
        const url = shouldCoerceYouTubeWatchToSearch(rawUrl, userPrompt)
          ? buildSearchUrl(userPrompt)
          : rawUrl
        return { type, tabId, url }
      }

      case 'closeTab':
      case 'switchTab':
      case 'getPageContent': {
        const tabId = readNumber(action.tabId) ?? activeTabId
        if (tabId == null) {
          throw new Error(`${type} action missing tabId at index ${index}`)
        }
        return { type, tabId }
      }

      case 'clickElement': {
        const tabId = readNumber(action.tabId) ?? activeTabId
        const selector = typeof action.selector === 'string' ? action.selector.trim() : ''
        const descriptor = readDescriptor(action.descriptor)
        if (tabId == null || !selector) {
          throw new Error(`clickElement action missing tabId/selector at index ${index}`)
        }
        return { type, tabId, selector, descriptor }
      }

      case 'fillForm': {
        const tabId = readNumber(action.tabId) ?? activeTabId
        const selector = typeof action.selector === 'string' ? action.selector.trim() : ''
        const value = typeof action.value === 'string' ? action.value : ''
        const descriptor = readDescriptor(action.descriptor)
        if (tabId == null || !selector) {
          throw new Error(`fillForm action missing tabId/selector at index ${index}`)
        }
        return { type, tabId, selector, value, descriptor }
      }

      case 'groupTabs': {
        const tabIds = Array.isArray(action.tabIds)
          ? action.tabIds.map(readNumber).filter((n): n is number => n != null)
          : []
        if (tabIds.length === 0) {
          throw new Error(`groupTabs action missing tabIds at index ${index}`)
        }
        const title =
          typeof action.title === 'string' && action.title.trim() ? action.title.trim() : undefined
        return { type, tabIds, title }
      }

      case 'waitMs': {
        // Look for ms, duration (alias), or seconds (alias)
        const ms =
          readNumber(action.ms) ??
          readNumber(action.duration) ??
          (readNumber(action.seconds) != null ? (readNumber(action.seconds) || 0) * 1000 : null)
        return { type, ms: ms != null ? Math.max(0, Math.floor(ms)) : 500 }
      }

      case 'scroll': {
        const tabId = readNumber(action.tabId) ?? activeTabId
        if (tabId == null) {
          throw new Error(`scroll action missing tabId at index ${index}`)
        }
        const direction = action.direction === 'up' ? 'up' : 'down'
        const pixels = readNumber(action.pixels) ?? 500
        return { type, tabId, direction, pixels }
      }
    }
  })

  return { explanation, actions: normalized }
}

// ── Chrome AI (Gemini Nano) availability check ────────────────────────────────
export async function checkChromeAIAvailability(): Promise<AIAvailability> {
  if (typeof LanguageModel === 'undefined') return 'unavailable'
  return LanguageModel.availability() as Promise<AIAvailability>
}

export async function checkAvailability(): Promise<AIAvailability> {
  const settings = await getSettings()
  log('Checking availability', { provider: settings.provider })
  if (settings.provider === 'chrome') {
    return checkChromeAIAvailability()
  }
  const keyMap: Record<string, string> = {
    openai: settings.openaiKey,
    anthropic: settings.anthropicKey,
    gemini: settings.geminiKey,
  }
  return keyMap[settings.provider]?.trim() ? 'available' : 'needs_api_key'
}

// ── Chrome AI session management ──────────────────────────────────────────────
let session: LanguageModelSession | null = null

async function getOrCreateSession(signal?: AbortSignal): Promise<LanguageModelSession> {
  if (session) return session
  if (typeof LanguageModel === 'undefined') {
    throw new Error('Chrome AI (Gemini Nano) is not available on this device.')
  }
  session = await LanguageModel.create({
    signal,
    initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
  })
  return session
}

export function destroySession(): void {
  session?.destroy()
  session = null
}

// ── Chrome AI streaming ───────────────────────────────────────────────────────
async function* streamChrome(
  context: string,
  history: HistoryMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const s = await getOrCreateSession(signal)
  let formattedContext = context
  if (history.length > 0) {
    const historyText = history
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n')
    formattedContext = `Conversation history:\n${historyText}\n\nLatest status & request:\n${context}`
  }
  const stream = s.promptStreaming(formattedContext, {
    signal,
    responseConstraint: RESPONSE_SCHEMA,
  })
  let fullText = ''
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fullText += value
      yield fullText
    }
  } catch (err) {
    destroySession()
    throw err
  } finally {
    reader.releaseLock()
  }
}

// ── OpenAI streaming ──────────────────────────────────────────────────────────
async function* streamOpenAI(
  context: string,
  settings: AISettings,
  history: HistoryMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  log('OpenAI request start', { model: settings.openaiModel, historyCount: history.length })
  const endpoint = 'https://api.openai.com/v1/chat/completions'
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.openaiKey}`,
  }
  const basePayload = {
    model: settings.openaiModel,
    stream: true,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map((msg) => ({
        role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: msg.content,
      })),
      { role: 'user', content: context },
    ],
  }

  const schemaPayload = {
    ...basePayload,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'tab_ai_actions',
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  }

  const request = (payload: object) =>
    fetch(endpoint, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify(payload),
    })

  let response = await request(schemaPayload)

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    warn('OpenAI strict schema request failed', { status: response.status, body })
    const shouldFallback =
      response.status === 400 &&
      /response_format|json_schema|invalid schema|unsupported/i.test(body)

    if (shouldFallback) {
      log('Retrying OpenAI without response_format json_schema')
      response = await request(basePayload)
      if (!response.ok) {
        const fallbackBody = await response.text().catch(() => '')
        throw new Error(`OpenAI error ${response.status}: ${fallbackBody}`)
      }
      log('OpenAI fallback request succeeded')
    } else {
      throw new Error(`OpenAI error ${response.status}: ${body}`)
    }
  }

  yield* parseSseStream(response, (data) => {
    if (data === '[DONE]') return null
    const parsed = JSON.parse(data) as { choices: { delta: { content?: string } }[] }
    return parsed.choices[0]?.delta?.content ?? null
  })
}

// ── Anthropic streaming ───────────────────────────────────────────────────────
async function* streamAnthropic(
  context: string,
  settings: AISettings,
  history: HistoryMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': settings.anthropicKey,
    },
    body: JSON.stringify({
      model: settings.anthropicModel,
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map((msg) => ({
          role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: msg.content,
        })),
        { role: 'user', content: context },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Anthropic error ${response.status}: ${body}`)
  }

  yield* parseSseStream(response, (data) => {
    const parsed = JSON.parse(data) as { type: string; delta?: { type: string; text?: string } }
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
      return parsed.delta.text ?? null
    }
    return null
  })
}

// ── Gemini streaming ──────────────────────────────────────────────────────────
async function* streamGemini(
  context: string,
  settings: AISettings,
  history: HistoryMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${settings.geminiModel}:streamGenerateContent?alt=sse&key=${settings.geminiKey}`

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        ...history.map((msg) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })),
        { role: 'user', parts: [{ text: context }] },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Gemini error ${response.status}: ${body}`)
  }

  yield* parseSseStream(response, (data) => {
    const parsed = JSON.parse(data) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    return parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? null
  })
}

// ── SSE line parser ───────────────────────────────────────────────────────────
// Reads an SSE response body, extracts `data:` lines, calls extractor for each,
// and yields the full accumulated text after each non-null token.
async function* parseSseStream(
  response: Response,
  extractor: (data: string) => string | null
): AsyncGenerator<string> {
  if (!response.body) throw new Error('Response body is null')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        const token = extractor(data)
        if (token != null) {
          accumulated += token
          yield accumulated
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Main inference call (streaming) ──────────────────────────────────────────
// onChunk receives the FULL cumulative response text so far (not a per-token delta).
export async function promptToActions(
  userPrompt: string,
  tabs: TabInfo[],
  activeTabId: number | null,
  history: HistoryMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<AIResponse> {
  const settings = await getSettings()
  const storedMemories = await loadAgentMemories()
  const memories = await refreshMemoriesOnInjection(storedMemories)
  log('promptToActions start', {
    provider: settings.provider,
    tabs: tabs.length,
    memories: memories.length,
    activeTabId,
    prompt: userPrompt,
  })

  const tabList = tabs
    .map((t) => {
      // Truncate long titles and URLs to keep the context concise
      const title = t.title.length > 60 ? t.title.slice(0, 57) + '…' : t.title
      const url = t.url.length > 80 ? t.url.slice(0, 77) + '…' : t.url
      return `  [id=${t.id}] "${title}" — ${url}${t.active ? ' ← ACTIVE' : ''}`
    })
    .join('\n')

  const context = [
    'Agent memory (persistent user preferences/facts):',
    memories.length > 0 ? memories.map((m, i) => `  ${i + 1}. ${m.text}`).join('\n') : '  (none)',
    '',
    `Open tabs (${tabs.length}):`,
    tabList || '  (none)',
    activeTabId != null ? `Active tab id: ${activeTabId}` : '',
    '',
    `User request: ${userPrompt}`,
  ]
    .filter(Boolean)
    .join('\n')

  // Select the appropriate streaming generator based on the configured provider.
  let generator: AsyncGenerator<string>
  if (settings.provider === 'openai') {
    generator = streamOpenAI(context, settings, history, signal)
  } else if (settings.provider === 'anthropic') {
    generator = streamAnthropic(context, settings, history, signal)
  } else if (settings.provider === 'gemini') {
    generator = streamGemini(context, settings, history, signal)
  } else {
    generator = streamChrome(context, history, signal)
  }

  let fullText = ''
  try {
    for await (const chunk of generator) {
      fullText = chunk
      onChunk(fullText)
    }
  } catch (err) {
    warn('Streaming failed', { provider: settings.provider, err })
    if (settings.provider === 'chrome') destroySession()
    throw err
  }

  let parsed: AIResponse
  try {
    parsed = JSON.parse(fullText) as AIResponse
  } catch {
    if (settings.provider === 'chrome') destroySession()
    throw new Error('The model response was incomplete. Please try again.')
  }
  const normalized = normalizeAndValidateResponse(
    parsed as unknown as { explanation?: unknown; actions?: unknown[] },
    userPrompt,
    activeTabId
  )
  log('promptToActions normalized response', {
    explanation: normalized.explanation,
    actionCount: normalized.actions.length,
  })
  return normalized
}

export async function rephraseUserPrompt(
  userPrompt: string,
  signal?: AbortSignal
): Promise<string> {
  const settings = await getSettings()
  log('rephraseUserPrompt start', { provider: settings.provider, prompt: userPrompt })

  const REPHRASE_SYSTEM_PROMPT = `You are an expert prompt engineer and browser automation translator.
Your job is to rewrite the user's natural language request into a highly precise, explicit, and structured instruction designed for a browser automation tool.
Make sure to:
1. Keep the user's core intent exactly unchanged.
2. Translate vague goals into explicit instructions (e.g. "go to gmail" -> "Navigate the active tab to https://mail.google.com and wait for it to load").
3. Make elements, actions, and expectations clear for downstream automation.
4. Output ONLY the optimized/rephrased instruction. Do NOT add any preamble, explanations, quotes, or conversational filler.`

  if (settings.provider === 'openai') {
    const endpoint = 'https://api.openai.com/v1/chat/completions'
    const response = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openaiKey}`,
      },
      body: JSON.stringify({
        model: settings.openaiModel,
        messages: [
          { role: 'system', content: REPHRASE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenAI rephrase error ${response.status}: ${body}`)
    }
    const data = await response.json()
    return data.choices[0]?.message?.content?.trim() ?? userPrompt
  }

  if (settings.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': settings.anthropicKey,
      },
      body: JSON.stringify({
        model: settings.anthropicModel,
        max_tokens: 1024,
        system: REPHRASE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Anthropic rephrase error ${response.status}: ${body}`)
    }
    const data = await response.json()
    return data.content[0]?.text?.trim() ?? userPrompt
  }

  if (settings.provider === 'gemini') {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${settings.geminiModel}:generateContent?key=${settings.geminiKey}`
    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: REPHRASE_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Gemini rephrase error ${response.status}: ${body}`)
    }
    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? userPrompt
  }

  // Chrome AI (Gemini Nano)
  if (typeof LanguageModel === 'undefined') {
    throw new Error('Chrome AI (Gemini Nano) is not available on this device.')
  }
  const s = await LanguageModel.create({
    signal,
    initialPrompts: [{ role: 'system', content: REPHRASE_SYSTEM_PROMPT }],
  })
  try {
    const result = await s.prompt(userPrompt, { signal })
    return result.trim()
  } finally {
    s.destroy()
  }
}
