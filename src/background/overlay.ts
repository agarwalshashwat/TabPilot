// ── Tab overlay ───────────────────────────────────────────────────────────────
// Injects a full-viewport blocking div into a tab while the agent is working,
// preventing the user from accidentally clicking/typing and corrupting agent state.
// All DOM functions must be self-contained (no imports, no outer-scope references).

const OVERLAY_ID = 'tabpilot-overlay'

// ── DOM functions (run inside the page) ───────────────────────────────────────

function domInjectOverlay(): void {
  const ID = 'tabpilot-overlay'
  if (document.getElementById(ID)) return // already injected

  const style = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: not-allowed;
    user-select: none;
    pointer-events: all;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `
  const labelStyle = `
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 10px;
    padding: 14px 24px;
    color: #e8eaed;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02em;
    animation: tap-pulse 1.4s ease-in-out infinite;
  `
  const keyframes = `
    @keyframes tap-pulse {
      0%, 100% { opacity: 0.85; }
      50%       { opacity: 1; }
    }
  `

  const overlay = document.createElement('div')
  overlay.id = ID
  overlay.setAttribute('style', style)

  const styleEl = document.createElement('style')
  styleEl.textContent = keyframes
  overlay.appendChild(styleEl)

  const label = document.createElement('div')
  label.setAttribute('style', labelStyle)
  label.textContent = '⚡ TabPilot is working…'
  overlay.appendChild(label)

  // Block all pointer and keyboard events
  overlay.addEventListener('click', (e) => e.stopPropagation(), true)
  overlay.addEventListener('mousedown', (e) => e.stopPropagation(), true)
  overlay.addEventListener('keydown', (e) => e.stopPropagation(), true)

  document.body?.appendChild(overlay)
}

function domRemoveOverlay(): void {
  document.getElementById('tabpilot-overlay')?.remove()
}

// ── Extension-side wrappers ───────────────────────────────────────────────────

export async function injectOverlay(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: domInjectOverlay,
    })
  } catch {
    // Tab may be navigating or on a non-scriptable URL — silently ignore.
  }
}

export async function removeOverlay(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: domRemoveOverlay,
    })
  } catch {
    // Tab may have been closed — ignore.
  }
}

export async function removeAllOverlays(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({})
    await Promise.allSettled(
      tabs.filter((t) => t.id != null && t.url?.startsWith('http')).map((t) => removeOverlay(t.id!))
    )
  } catch {
    // Best-effort cleanup.
  }
}

// Export the overlay ID so executor can reference it without a magic string.
export { OVERLAY_ID }
