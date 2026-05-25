import type { TabInfo } from '../../shared/types'

export type PlatformId =
  | 'youtube'
  | 'google-search'
  | 'gmail'
  | 'google-maps'
  | 'amazon'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'reddit'
  | 'x-twitter'

export interface PlatformPlaybook {
  id: PlatformId
  name: string
  hostPatterns: RegExp[]
  urlPatterns: RegExp[]
  promptKeywords: string[]
  pageMarkers: string[]
  selectorAliases: Record<string, string>
  plannerHints: string[]
  recoveryHints: string[]
  verificationHints: string[]
}

export interface ResolvedPlatformMatch {
  playbook: PlatformPlaybook
  score: number
  reasons: string[]
  matchedTabs: number[]
}

export interface ResolvePlatformContextInput {
  prompt: string
  tabs: TabInfo[]
  activeTabId: number | null
}

export interface ResolvedPlatformContext {
  matches: ResolvedPlatformMatch[]
  primary: ResolvedPlatformMatch | null
}
