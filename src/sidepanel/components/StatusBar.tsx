import type { AIAvailability } from '../../shared/types'

interface Props {
  availability: AIAvailability | null
  onDownload: () => void
  downloadProgress: { loaded: number; total: number } | null
  /** Optional provider name shown next to 'ready' status. */
  providerLabel?: string
}

const LABELS: Record<NonNullable<AIAvailability>, string> = {
  available: 'Gemini Nano ready',
  downloadable: 'Gemini Nano not downloaded — click to download',
  downloading: 'Downloading Gemini Nano…',
  unavailable: 'Gemini Nano unavailable on this device',
  needs_api_key: 'No API key configured — open settings ⚙',
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

export function StatusBar({ availability, onDownload, downloadProgress, providerLabel }: Props) {
  const dotClass = availability ?? 'checking'
  const baseLabel = availability ? LABELS[availability] : 'Checking AI status…'
  const label = availability === 'available' && providerLabel ? `${providerLabel} ready` : baseLabel
  const isClickable = availability === 'downloadable'
  const isDownloading = availability === 'downloading'

  const pct =
    downloadProgress && downloadProgress.total > 0
      ? Math.round((downloadProgress.loaded / downloadProgress.total) * 100)
      : null

  return (
    <div
      className={`status-bar${isClickable ? ' status-bar--clickable' : ''}`}
      onClick={isClickable ? onDownload : undefined}
      role={isClickable ? 'button' : undefined}
      title={isClickable ? 'Click to download Gemini Nano' : undefined}
    >
      <div className="status-bar-row">
        <span className={`status-dot ${dotClass}`} />
        <span className="status-label">{label}</span>
        {isClickable && <span className="status-download-cta">↓ Download</span>}
        {isDownloading && pct != null && <span className="status-pct">{pct}%</span>}
      </div>

      {isDownloading && (
        <div className="status-progress-track">
          <div
            className="status-progress-fill"
            style={{ width: pct != null ? `${pct}%` : '30%' }}
            data-indeterminate={pct == null ? 'true' : undefined}
          />
        </div>
      )}

      {isDownloading && downloadProgress && downloadProgress.loaded > 0 && (
        <div className="status-progress-bytes">
          {formatBytes(downloadProgress.loaded)}
          {downloadProgress.total > 0 && ` / ${formatBytes(downloadProgress.total)}`}
        </div>
      )}
    </div>
  )
}
