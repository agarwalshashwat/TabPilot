<p align="center">
  <img src="public/branding/logo-light.png" alt="TabPilot Logo" width="220" />
</p>

# TabPilot

<p align="center"><b>Your browser. Your agent.</b></p>

# TabPilot

TabPilot is a free, open-source Chrome extension that uses local AI (Gemini Nano) to plan and execute tab actions—no cloud, no fees, no data sharing. Boost your productivity and privacy with AI-powered tab automation, right in your browser.

## Why Open Source?

TabPilot is open source to empower users with transparency, privacy, and control. By making the code public, we:

- Enable community-driven innovation
- Build trust—no hidden data collection
- Let anyone audit, contribute, or extend the project
- Keep the core experience free for everyone

## How to Contribute

We welcome contributions of all kinds! You can:

- Suggest features or report bugs via [GitHub Issues](https://github.com/agarwalshashwat/TabPilot/issues)
- Join discussions and share ideas in [GitHub Discussions](https://github.com/agarwalshashwat/TabPilot/discussions)
- Submit pull requests for code, docs, or tests
- Help with translations, design, or outreach

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Community & Support

- **Website:** [https://yourdomain.com/tabpilot](https://yourdomain.com/tabpilot) <!-- Update with your subdomain -->
- **GitHub Discussions:** [TabPilot Discussions](https://github.com/agarwalshashwat/TabPilot/discussions)
- **Sponsor:** [GitHub Sponsors](https://github.com/sponsors/agarwalshashwat) <!-- Update if enabled -->
- **Contact:** Open an issue or join the discussion!

## Features

- Prompt-driven tab automation (`openTab`, `closeTab`, `switchTab`, `navigateTo`, `clickElement`, `fillForm`, `getPageContent`, `groupTabs`, `waitMs`)
- Multi-provider AI support: Chrome Gemini Nano, OpenAI, Anthropic, Google Gemini
- Streaming status updates from worker to sidepanel
- Chat persistence and retry/new-chat UX
- Recent Chats tab with persisted multi-chat listing and switching
- Prompt rephrasing UX:
  - `✨ Rephrase` in chat input (rewrite before sending)
  - `✨ Rephrase & Run` on previous user turns (rewrite + execute)
- Save and run routines
- Extension-side memory across chats, with LRU behavior (capacity 50)
  - Memories are injected into planning prompts
  - Recency is refreshed on injection and manual access
- Conversation history is sent with prompts for better multi-turn context routing
- Dev mode via CRXJS + Vite

## Scripts

- `npm run dev`: Start CRXJS/Vite dev server (hot reload)
- `npm run build`: Type-check + production build to `dist/`
- `npm run lint`: Run ESLint
- `npm test`: Run Playwright tests

## Development Setup

1. Install Node.js 22.x (required):

```bash
# if you use nvm
nvm install 22
nvm use 22
```

2. Install dependencies:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

4. In Chrome:

- Open `chrome://extensions`
- Enable Developer mode
- Load unpacked extension from this project (or CRXJS-generated output, depending on your dev flow)

### Version Guardrails

- This repo enforces `Node 22.12+` during `npm install`.
- If install fails with a Node version message, switch to Node 22 and re-run `npm install`.

## Debugging And Logs

When a task appears to stop early or return incomplete output, inspect these first:

1. Service worker logs (primary runtime source)

- `chrome://extensions` -> TabPilot -> `Service worker` -> `Inspect`
- This shows worker-side errors and message flow.

2. Sidepanel logs (UI message handling)

- Open the extension sidepanel
- Right-click inside panel -> `Inspect`
- Check Console for incoming message handling issues.

3. In-panel execution trace

- `ACTION_PROGRESS`, `TASK_COMPLETE`, and `TASK_ERROR` are reflected in the action log/status UI.

### Console Log Prefixes

The app now emits structured logs with consistent prefixes:

- `[TAP][worker]` in service worker DevTools (message routing, task lifecycle, errors)
- `[TAP][ai]` in service worker DevTools (provider selection, OpenAI fallback, normalization)
- `[TAP][executor]` in service worker DevTools (action start/done/error, remap, load waits)
- `[TAP][sidepanel]` in sidepanel DevTools (port connect/disconnect, sent/received messages)

### Log Toggle

Each module currently uses a local constant named `DEBUG_LOGS`.

- Logs are disabled by default for production safety. Set `DEBUG_LOGS = true` in these files only for local debugging:
  - `src/background/worker.ts`
  - `src/background/ai.ts`
  - `src/background/executor.ts`
  - `src/sidepanel/hooks/useChromeMessages.ts`

## Port Disconnect Handling

The worker uses safe message posting to avoid noisy unhandled errors when the sidepanel disconnects (for example panel close, extension reload, or HMR).

- If a port is disconnected, worker messages are dropped safely.
- In-flight tasks are aborted on disconnect.

## `getPageContent` Follow-up Responses

After actions execute, any captured page content is summarized and sent back as an assistant follow-up message.

- Action execution still appears in the action log.
- A separate assistant message provides a readable summary.

## Agent Memory (LRU)

Memories are stored in `chrome.storage.local` and shown in the **Memory** view.

- Storage key: `agent_memories`
- Capacity: `50`
- Eviction policy: least recently used (LRU)
- `lastAccessedAt` is refreshed when:
  - a memory is injected into prompt context
  - the user manually touches a memory card in the Memory view

This keeps long-lived preferences while automatically pruning stale items.

## Rephrase Flow

The sidepanel supports two rephrase entry points:

1. Input-level rephrase (`✨ Rephrase`): rewrites current input and immediately runs the rewritten prompt.
2. History-level rephrase (`✨ Rephrase & Run`): rewrites the last user prompt in chat history and re-runs it.

Protocol path:

- Sidepanel sends `REPHRASE_PROMPT`
- Worker calls provider-aware `rephraseUserPrompt(...)`
- Worker returns `REPHRASED_PROMPT`
- Sidepanel starts a fresh execution using the rewritten prompt

## Conversation Context Routing

`EXECUTE_PROMPT` now includes prior chat turns (`history`) so model calls can use recent user/assistant context. This improves follow-up interpretation and reduces misrouting in multi-turn tasks.

## Recent Chats

Use the **Recent Chats** top-level tab in the sidepanel to browse and switch among saved conversations.

- The list shows a human-friendly chat title (first user prompt snippet), message count, and recency metadata.
- Selecting a chat restores its full message history into the **Chat** view.
- **New chat** creates a fresh thread without deleting prior chats.
- Legacy single-thread storage (`chat_history`) is migrated into the multi-thread store on load.
- Storage key: `chat_threads_state_v1`
- Recency list capacity: `20` chats (most recently updated kept)
- Per-chat message cap: `100` messages

## Testing

Playwright coverage in `tests/e2e/extension.spec.ts` includes:

- extension service worker + sidepanel smoke
- settings persistence
- view toggles (Chat / Recent Chats / Routines / Memory)
- routines validation/import/persistence flow
- memory add/persist/delete flow
- rephrase visibility/trigger flow
- recent chat listing + switching persistence across reload

Current suite status: `6 passed`.

## Architecture Doc

System design notes are documented in `docs/guides/architecture.md`.

---

## Notes

- CRXJS may show a warning about rollup/rolldown options during build; this is typically non-blocking.
- If Playwright tests fail due to missing browser binaries, run:

```bash
npx playwright install chromium
```

- If extension E2E tests fail in a restricted/sandboxed shell with Chromium profile or ProcessSingleton
  errors, run `npm test` in a normal local terminal session.

## Open-Source Project Standards

- License: MIT (see LICENSE)
- Contribution guide: CONTRIBUTING.md
- Code of conduct: CODE_OF_CONDUCT.md
- Security policy: SECURITY.md
- Privacy policy: PRIVACY.md
- Support policy: SUPPORT.md
- Changelog strategy: CHANGELOG.md (Semantic Versioning)

## Privacy and Security Summary

- External providers (OpenAI, Anthropic, Gemini API) receive prompts and selected execution context.
- Sensitive provider settings are stored in extension local storage.
- Default runtime logs are disabled for production safety.
- Report vulnerabilities privately using SECURITY.md.

## Operational Constraints

- v1 support target is Chrome only; Safari packaging is out of scope for initial release.
- For native GUI automation validation workflows, keep the browser window in the active macOS
  space. Cross-space visibility and focus can vary and should not be used as a deterministic CI gate.
- Recommended automation workflow for interactive UI checks: snapshot state, apply one action,
  re-snapshot and verify.

## Release Process

- CI workflow runs format, lint, build, and tests.
- Tag a release with vX.Y.Z to trigger GitHub release packaging.
- Use CHANGELOG.md and Semantic Versioning for release notes.
