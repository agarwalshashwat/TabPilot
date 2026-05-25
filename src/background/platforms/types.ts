import type { TabInfo } from '../../shared/types'

export type PlatformPackSpecVersion = '1.0.0'

export interface PlatformExecutionPolicy {
  strictSearchQuerySanitization?: boolean
  preferredResultSelectors?: string[]
  disallowedClickSelectors?: string[]
  requireWatchUrlForSuccess?: boolean
}

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
  specVersion: PlatformPackSpecVersion
  minTabPilotVersion: string
  documentationPath?: string
  hostPatterns: RegExp[]
  urlPatterns: RegExp[]
  promptKeywords: string[]
  pageMarkers: string[]
  selectorAliases: Record<string, string>
  plannerHints: string[]
  recoveryHints: string[]
  verificationHints: string[]
  executionPolicy?: PlatformExecutionPolicy
}

export interface RawPlatformPlaybook {
  id: PlatformId
  name: string
  specVersion?: PlatformPackSpecVersion | string
  minTabPilotVersion?: string
  documentationPath?: string
  hostPatterns: string[]
  urlPatterns: string[]
  promptKeywords: string[]
  pageMarkers: string[]
  selectorAliases: Record<string, string>
  plannerHints: string[]
  recoveryHints: string[]
  verificationHints: string[]
  executionPolicy?: PlatformExecutionPolicy
}

export interface PlatformPackValidationIssue {
  index: number
  playbookId: string
  message: string
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
