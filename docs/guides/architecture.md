# TabPilot — Basic Architecture

## Overview

TabPilot is a Chrome extension that converts natural-language user prompts into tab and page actions. It is composed of:

- A **React sidepanel UI** for chat, routine management, and settings.
- A **background service worker** that orchestrates AI planning and action execution.
- Shared **typed message contracts** and action schemas.

Primary goal: keep UI state and long-running execution decoupled through a message-driven boundary.

## High-level Components

### 1) Sidepanel (UI)

Key files:

- `src/sidepanel/App.tsx`
- `src/sidepanel/hooks/useChromeMessages.ts`
- `src/sidepanel/components/*`

Responsibilities:

- Collect user input and dispatch commands (`EXECUTE_PROMPT`, `RUN_ROUTINE`, etc.).
- Render task lifecycle: thinking, planned actions, progress, completion/error.
- Persist chat history in `chrome.storage.local`.
- Load and edit provider settings through a modal.

### 2) Background Worker (Orchestration)

Key files:

- `src/background/worker.ts`
- `src/background/ai.ts`
- `src/background/executor.ts`
- `src/background/routines.ts`

Responsibilities:

- Maintain port-based communication with sidepanel.
- Route inbound messages and emit outbound updates.
- Resolve AI provider availability and generate action plans.
- Execute actions with progress callbacks and cancellation support.
- Save/list/delete/run routines and resolve tab references at runtime.

### 3) Shared Contracts

Key file:

- `src/shared/types.ts`

Responsibilities:

- Define canonical `TabAction` union.
- Define worker inbound/outbound message shapes.
- Define routine storage structures (`Routine`, `SavedAction`).

## Message Flow

### Prompt execution flow

1. Sidepanel sends `EXECUTE_PROMPT`.
2. Worker emits `AI_THINKING` and streaming updates (`AI_STREAM_CHUNK`).
3. Worker emits `AI_RESPONSE` with explanation + planned actions.
4. Worker emits `TASK_SNAPSHOT` (save-ready routine payload).
5. Worker executes actions and emits `ACTION_PROGRESS` updates.
6. Worker emits `TASK_COMPLETE` or `TASK_ERROR`.
7. If page content was captured, worker emits `ASSISTANT_MESSAGE` follow-up summary.

### Routines flow

1. Sidepanel requests/receives `ROUTINES_LIST`.
2. Save path sends `SAVE_ROUTINE`; worker persists and returns refreshed list.
3. Run path sends `RUN_ROUTINE`; worker resolves saved tab references, then executes as normal action flow.

## Storage Model

- `chrome.storage.local`
  - `ai_settings` for provider config.
  - `agent_memories` for memory cards used in planning context.
  - `chat_threads_state_v1` for sidepanel conversation persistence.
- `chrome.storage.sync`
  - Routines split by key (`routine_<id>`) plus `routine_index` array for ordering.

## Execution Model and Safety

- Worker tracks one active task through an `AbortController`.
- New task requests abort previous in-flight work.
- Port disconnects are treated as non-fatal; worker uses guarded post (`safePost`).
- Action execution is centralized in executor with explicit progress events and error propagation.

## AI Provider Strategy

- Supports Chrome Gemini Nano and external providers (OpenAI, Anthropic, Gemini).
- Settings changes trigger `SETTINGS_CHANGED` and worker re-checks effective availability.
- UI availability/status is surfaced via `AI_AVAILABILITY` and download progress events.

## Testing Strategy (Current and Planned)

- End-to-end extension smoke test validates service worker registration and sidepanel rendering.
- Expanded Playwright coverage targets:
  - Settings modal persistence and provider switching.
  - Chat/Routines view toggle behavior.
  - Routines empty state + import modal validation + persistence verification.

## Extension Lifecycle Notes

- Toolbar icon opens sidepanel by configuration in worker startup.
- Sidepanel establishes a runtime port (`tabpilot`) and initializes with `CHECK_AI`.
- Worker responds with current availability and initial routines to hydrate UI state.
