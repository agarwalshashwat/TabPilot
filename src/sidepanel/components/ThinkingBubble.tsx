// ThinkingBubble — shows the AI's in-progress response as it streams.
//
// Chrome's promptStreaming returns delta chunks. We accumulate them and
// extract the explanation field from partial JSON so the user sees
// natural language rather than raw JSON.

import { useEffect, useRef } from 'react'

interface Props {
  rawJson: string
}

/** Extract the explanation string from partial or complete JSON. */
function extractExplanation(raw: string): string {
  if (!raw) return ''
  // Complete explanation field: "explanation":"<value>"
  const full = raw.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (full) return full[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
  // Partial (still being streamed — no closing quote yet)
  const partial = raw.match(/"explanation"\s*:\s*"([^"]*?)\s*$/)
  if (partial) return partial[1]
  return ''
}

/** True while the JSON stream is still open (no closing `}` yet). */
function isStreamingJson(raw: string): boolean {
  return raw.length > 0 && !raw.trimEnd().endsWith('}')
}

export function ThinkingBubble({ rawJson }: Props) {
  const explanation = extractExplanation(rawJson)
  const streaming = isStreamingJson(rawJson)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [explanation])

  return (
    <div className="thinking-bubble">
      <div className="thinking-header">
        <span className="thinking-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="thinking-label">Thinking…</span>
      </div>

      {explanation ? (
        <p className="thinking-text">
          {explanation}
          {streaming && <span className="thinking-cursor" />}
        </p>
      ) : (
        // No explanation extracted yet — model is generating the opening JSON
        rawJson.length > 0 && (
          <p className="thinking-raw">
            {rawJson.slice(0, 120)}
            {rawJson.length > 120 ? '…' : ''}
          </p>
        )
      )}
      <div ref={bottomRef} />
    </div>
  )
}
