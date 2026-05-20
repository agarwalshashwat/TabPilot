// Type declarations for Chrome's built-in AI (LanguageModel / Gemini Nano)
// Available in Chrome 138+ extensions. Not yet in @types/chrome.

declare type LanguageModelAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'

declare interface LanguageModelSession {
  prompt(
    message: string,
    options?: {
      signal?: AbortSignal
      responseConstraint?: object
    },
  ): Promise<string>
  promptStreaming(
    message: string,
    options?: {
      signal?: AbortSignal
      responseConstraint?: object
    },
  ): ReadableStream<string>
  append(message: {
    role: 'user' | 'assistant'
    content: string
  }): Promise<void>
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>
  destroy(): void
  readonly contextUsage: number
  readonly contextWindow: number
}

declare interface LanguageModelCreateOptions {
  temperature?: number
  topK?: number
  signal?: AbortSignal
  initialPrompts?: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  expectedInputs?: Array<{ type: string }>
  expectedOutputs?: Array<{ type: string }>
  omitResponseConstraintInput?: boolean
  /** Called with a monitor EventTarget that fires `downloadprogress` ProgressEvents. */
  monitor?: (monitor: EventTarget) => void
}

declare const LanguageModel: {
  availability(): Promise<LanguageModelAvailability>
  create(
    options?: LanguageModelCreateOptions,
  ): Promise<LanguageModelSession>
  params(): Promise<{
    defaultTopK: number
    maxTopK: number
    defaultTemperature: number
  }>
}
