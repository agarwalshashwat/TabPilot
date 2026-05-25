import playbooksData from './data/playbooks.json'
import type {
  PlatformId,
  PlatformPlaybook,
  PlatformPackSpecVersion,
  PlatformPackValidationIssue,
  RawPlatformPlaybook,
  ResolvePlatformContextInput,
  ResolvedPlatformContext,
  ResolvedPlatformMatch,
} from './types'

const DEFAULT_REGEX_FLAGS = 'i'
const SUPPORTED_SPEC_VERSION: PlatformPackSpecVersion = '1.0.0'
const DEFAULT_MIN_TABPILOT_VERSION = '0.1.0'
const KNOWN_PLATFORM_IDS: ReadonlySet<string> = new Set([
  'youtube',
  'google-search',
  'gmail',
  'google-maps',
  'amazon',
  'facebook',
  'instagram',
  'linkedin',
  'reddit',
  'x-twitter',
])

const RAW_PLATFORM_PLAYBOOKS = playbooksData as unknown

interface PlatformPackLoadDiagnostics {
  loaded: number
  skipped: number
  issues: PlatformPackValidationIssue[]
}

const diagnostics: PlatformPackLoadDiagnostics = {
  loaded: 0,
  skipped: 0,
  issues: [],
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeAliases(value: unknown): Record<string, string> {
  if (!isObject(value)) return {}
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, alias]) => [key.trim(), alias.trim()] as const)
    .filter(([key, alias]) => key.length > 0 && alias.length > 0)
  return Object.fromEntries(entries)
}

function asPlatformId(value: unknown): PlatformId | null {
  if (typeof value !== 'string') return null
  return KNOWN_PLATFORM_IDS.has(value) ? (value as PlatformId) : null
}

function addIssue(index: number, playbookId: string, message: string): void {
  diagnostics.issues.push({ index, playbookId, message })
}

function validateRawPlaybook(index: number, value: unknown): RawPlatformPlaybook | null {
  if (!isObject(value)) {
    addIssue(index, 'unknown', 'Playbook is not an object.')
    return null
  }

  const id = asPlatformId(value.id)
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!id) {
    addIssue(index, String(value.id ?? 'unknown'), 'Unknown or missing playbook id.')
    return null
  }
  if (!name) {
    addIssue(index, id, 'Missing playbook name.')
    return null
  }

  const hostPatterns = normalizeStringArray(value.hostPatterns)
  const urlPatterns = normalizeStringArray(value.urlPatterns)
  const promptKeywords = normalizeStringArray(value.promptKeywords)
  if (hostPatterns.length === 0 || urlPatterns.length === 0 || promptKeywords.length === 0) {
    addIssue(
      index,
      id,
      'Missing required matcher fields (hostPatterns/urlPatterns/promptKeywords).'
    )
    return null
  }

  if (!isStringArray(value.hostPatterns) || !isStringArray(value.urlPatterns)) {
    addIssue(index, id, 'hostPatterns and urlPatterns must be arrays of strings.')
    return null
  }

  const selectorAliases = normalizeAliases(value.selectorAliases)
  const specVersionRaw =
    typeof value.specVersion === 'string' && value.specVersion.trim()
      ? value.specVersion.trim()
      : SUPPORTED_SPEC_VERSION
  if (specVersionRaw !== SUPPORTED_SPEC_VERSION) {
    addIssue(
      index,
      id,
      `Unsupported specVersion "${specVersionRaw}". Expected ${SUPPORTED_SPEC_VERSION}.`
    )
    return null
  }

  return {
    id,
    name,
    specVersion: specVersionRaw,
    minTabPilotVersion:
      typeof value.minTabPilotVersion === 'string' && value.minTabPilotVersion.trim()
        ? value.minTabPilotVersion.trim()
        : DEFAULT_MIN_TABPILOT_VERSION,
    documentationPath:
      typeof value.documentationPath === 'string' && value.documentationPath.trim()
        ? value.documentationPath.trim()
        : undefined,
    hostPatterns,
    urlPatterns,
    promptKeywords,
    pageMarkers: normalizeStringArray(value.pageMarkers),
    selectorAliases,
    plannerHints: normalizeStringArray(value.plannerHints),
    recoveryHints: normalizeStringArray(value.recoveryHints),
    verificationHints: normalizeStringArray(value.verificationHints),
    executionPolicy: isObject(value.executionPolicy)
      ? {
          strictSearchQuerySanitization:
            typeof value.executionPolicy.strictSearchQuerySanitization === 'boolean'
              ? value.executionPolicy.strictSearchQuerySanitization
              : undefined,
          preferredResultSelectors: normalizeStringArray(
            value.executionPolicy.preferredResultSelectors
          ),
          disallowedClickSelectors: normalizeStringArray(
            value.executionPolicy.disallowedClickSelectors
          ),
          requireWatchUrlForSuccess:
            typeof value.executionPolicy.requireWatchUrlForSuccess === 'boolean'
              ? value.executionPolicy.requireWatchUrlForSuccess
              : undefined,
        }
      : undefined,
  }
}

function toRegex(pattern: string): RegExp {
  return new RegExp(pattern, DEFAULT_REGEX_FLAGS)
}

function normalizePlaybook(raw: RawPlatformPlaybook): PlatformPlaybook {
  return {
    ...raw,
    specVersion: (raw.specVersion as PlatformPackSpecVersion) || SUPPORTED_SPEC_VERSION,
    minTabPilotVersion: raw.minTabPilotVersion || DEFAULT_MIN_TABPILOT_VERSION,
    hostPatterns: raw.hostPatterns.map(toRegex),
    urlPatterns: raw.urlPatterns.map(toRegex),
  }
}

const validatedPlaybooks = (Array.isArray(RAW_PLATFORM_PLAYBOOKS) ? RAW_PLATFORM_PLAYBOOKS : [])
  .map((raw, index) => validateRawPlaybook(index, raw))
  .filter((raw): raw is RawPlatformPlaybook => raw != null)

diagnostics.loaded = validatedPlaybooks.length
diagnostics.skipped = diagnostics.issues.length

if (diagnostics.issues.length > 0) {
  console.warn('[TAP][platforms] Some platform packs were skipped due to validation errors.', {
    skipped: diagnostics.skipped,
    issues: diagnostics.issues,
  })
}

const PLATFORM_PLAYBOOKS: PlatformPlaybook[] = validatedPlaybooks.map(normalizePlaybook)

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_#.[\](){}>:+~*="'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keywordHits(text: string, keywords: string[]): number {
  const normalized = normalizeText(text)
  if (!normalized) return 0

  let hits = 0
  for (const keyword of keywords) {
    const escapedKeyword = keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i')
    if (pattern.test(normalized)) hits += 1
  }
  return hits
}

function readHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function readUrlText(url: string): string {
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

function scorePlaybook(
  playbook: PlatformPlaybook,
  input: ResolvePlatformContextInput
): ResolvedPlatformMatch | null {
  const reasons: string[] = []
  let score = 0
  const matchedTabs = new Set<number>()
  const prompt = normalizeText(input.prompt)

  const promptHits = keywordHits(prompt, playbook.promptKeywords)
  if (promptHits > 0) {
    score += Math.min(30, promptHits * 8)
    reasons.push(`prompt matched ${promptHits} keyword${promptHits === 1 ? '' : 's'}`)
  }

  for (const tab of input.tabs) {
    const urlText = readUrlText(tab.url)
    const hostname = readHostname(tab.url)
    const tabReasons: string[] = []
    let tabScore = 0

    if (hostname && playbook.hostPatterns.some((pattern) => pattern.test(hostname))) {
      tabScore += 55
      tabReasons.push(`host matched ${hostname}`)
    }

    if (playbook.urlPatterns.some((pattern) => pattern.test(urlText))) {
      tabScore += 35
      tabReasons.push(`url matched ${urlText}`)
    }

    const titleText = normalizeText(tab.title)
    const markerHits = [
      ...playbook.pageMarkers,
      ...(playbook.selectorAliases ? Object.values(playbook.selectorAliases) : []),
    ].filter((marker) => {
      if (!marker) return false
      const normalizedMarker = normalizeText(marker)
      if (!normalizedMarker) return false
      const normalizedUrl = normalizeText(urlText)
      return titleText.includes(normalizedMarker) || normalizedUrl.includes(normalizedMarker)
    }).length

    if (markerHits > 0) {
      tabScore += Math.min(20, markerHits * 5)
      tabReasons.push(`page markers matched ${markerHits}`)
    }

    if (tab.active && input.activeTabId != null && tab.id === input.activeTabId) {
      tabScore += 12
      tabReasons.push('active tab')
    }

    if (tabScore > 0) {
      score += tabScore
      matchedTabs.add(tab.id)
      reasons.push(`tab ${tab.id}: ${tabReasons.join(', ')}`)
    }
  }

  if (score === 0) return null

  return {
    playbook,
    score,
    reasons,
    matchedTabs: [...matchedTabs],
  }
}

export function resolvePlatformContext(
  input: ResolvePlatformContextInput
): ResolvedPlatformContext {
  const matches = PLATFORM_PLAYBOOKS.map((playbook) => scorePlaybook(playbook, input))
    .filter((match): match is ResolvedPlatformMatch => match != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return {
    primary: matches[0] ?? null,
    matches,
  }
}

function formatAliases(aliases: Record<string, string>): string {
  const entries = Object.entries(aliases)
  if (entries.length === 0) return '  (none)'
  return entries.map(([key, value]) => `  - ${key}: ${value}`).join('\n')
}

function formatBullets(items: string[]): string {
  if (items.length === 0) return '  (none)'
  return items.map((item) => `  - ${item}`).join('\n')
}

export function formatPlatformContextBlock(context: ResolvedPlatformContext): string {
  if (!context.primary) return ''

  const primary = context.primary
  const secondary = context.matches.slice(1)
  const sections = [
    `Primary platform: ${primary.playbook.name} (${primary.score})`,
    `Why selected: ${primary.reasons.join('; ')}`,
    'Selector aliases:',
    formatAliases(primary.playbook.selectorAliases),
    'Planner hints:',
    formatBullets(primary.playbook.plannerHints),
    'Recovery hints:',
    formatBullets(primary.playbook.recoveryHints),
    'Verification hints:',
    formatBullets(primary.playbook.verificationHints),
  ]

  if (secondary.length > 0) {
    sections.push(
      'Secondary platform candidates:',
      ...secondary.map((match) => `  - ${match.playbook.name} (${match.score})`)
    )
  }

  return ['Platform playbook context:', ...sections].join('\n')
}

export function listPlatformPlaybooks(): PlatformId[] {
  return PLATFORM_PLAYBOOKS.map((playbook) => playbook.id)
}

export function getPlatformPackDiagnostics(): PlatformPackLoadDiagnostics {
  return {
    loaded: diagnostics.loaded,
    skipped: diagnostics.skipped,
    issues: [...diagnostics.issues],
  }
}

export { PLATFORM_PLAYBOOKS }
