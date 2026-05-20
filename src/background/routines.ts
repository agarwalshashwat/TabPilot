import type { Routine, SavedAction, TabAction } from '../shared/types'

// Each routine is stored under its own key to avoid hitting the per-item
// 8 KB limit of chrome.storage.sync.
const KEY_PREFIX = 'routine_'
const INDEX_KEY = 'routine_index' // ordered array of ids

// ── Storage helpers ───────────────────────────────────────────────────────────

async function getIndex(): Promise<string[]> {
  const result = await chrome.storage.sync.get(INDEX_KEY)
  return (result[INDEX_KEY] as string[] | undefined) ?? []
}

async function setIndex(ids: string[]): Promise<void> {
  await chrome.storage.sync.set({ [INDEX_KEY]: ids })
}

export async function loadRoutines(): Promise<Routine[]> {
  const ids = await getIndex()
  if (ids.length === 0) return []
  const keys = ids.map((id) => `${KEY_PREFIX}${id}`)
  const result = await chrome.storage.sync.get(keys)
  return ids
    .map((id) => result[`${KEY_PREFIX}${id}`] as Routine | undefined)
    .filter((r): r is Routine => r != null)
}

export async function saveRoutine(routine: Routine): Promise<void> {
  const ids = await getIndex()
  if (!ids.includes(routine.id)) {
    await setIndex([...ids, routine.id])
  }
  await chrome.storage.sync.set({ [`${KEY_PREFIX}${routine.id}`]: routine })
}

export async function deleteRoutine(id: string): Promise<void> {
  const ids = await getIndex()
  await setIndex(ids.filter((i) => i !== id))
  await chrome.storage.sync.remove(`${KEY_PREFIX}${id}`)
}

// ── Tab ID resolution ─────────────────────────────────────────────────────────
// At run time, tabId values from save time are invalid. We find a matching
// live tab by comparing origins. If no match is found we open the URL (for
// navigateTo) or throw a descriptive error.

function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export async function resolveActions(savedActions: SavedAction[]): Promise<TabAction[]> {
  const allTabs = await chrome.tabs.query({})
  // Cache origin → tabId so we don't repeat tab queries per action
  const originToTabId = new Map<string, number>()
  for (const tab of allTabs) {
    if (tab.id == null || !tab.url) continue
    const origin = getOrigin(tab.url)
    if (origin && !originToTabId.has(origin)) {
      originToTabId.set(origin, tab.id)
    }
  }

  const resolved: TabAction[] = []

  for (const { action, savedTabUrl } of savedActions) {
    // Actions that don't reference a tab (openTab, waitMs) are used as-is.
    if (!('tabId' in action)) {
      resolved.push(action)
      continue
    }

    // If we have a savedTabUrl, try to resolve to a live tab.
    if (savedTabUrl) {
      const origin = getOrigin(savedTabUrl)
      if (origin) {
        let liveTabId = originToTabId.get(origin)

        // For navigateTo: if the tab isn't open, open it and use the new id.
        if (liveTabId == null && action.type === 'navigateTo') {
          const newTab = await chrome.tabs.create({ url: savedTabUrl, active: false })
          if (newTab.id == null) throw new Error(`Could not open tab for ${savedTabUrl}`)
          liveTabId = newTab.id
          originToTabId.set(origin, liveTabId)
        }

        if (liveTabId == null) {
          throw new Error(
            `Routine requires a tab open at "${savedTabUrl}" but none was found.`,
          )
        }

        resolved.push({ ...action, tabId: liveTabId } as TabAction)
        continue
      }
    }

    // No savedTabUrl — pass the action through unchanged (tabId may be stale).
    resolved.push(action)
  }

  return resolved
}

// ── Snapshot: capture SavedActions from live TabActions ───────────────────────
// Called at save time; populates savedTabUrl by querying the live tab URL.

export async function snapshotActions(actions: TabAction[]): Promise<SavedAction[]> {
  const savedActions: SavedAction[] = []

  for (const action of actions) {
    if (!('tabId' in action)) {
      savedActions.push({ action })
      continue
    }
    try {
      const tab = await chrome.tabs.get((action as { tabId: number }).tabId)
      savedActions.push({ action, savedTabUrl: tab.url ?? undefined })
    } catch {
      // Tab may have been closed between task completion and save.
      savedActions.push({ action })
    }
  }

  return savedActions
}
