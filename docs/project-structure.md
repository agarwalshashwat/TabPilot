# Project Structure

```
tab-ai-pilot/
  .github/                  GitHub templates and workflow automation
  docs/                     Architecture, readiness, and contributor docs
    guides/                 In-depth technical guides
  public/                   Static extension assets
  src/
    background/             Service worker orchestration and action execution
    shared/                 Shared types used by worker and sidepanel
    sidepanel/              React sidepanel UI and hooks
  tests/
    e2e/                    Playwright extension end-to-end tests
  manifest.json             Chrome extension manifest (MV3)
  sidepanel.html            Sidepanel entry HTML
  vite.config.ts            Vite + CRXJS build configuration
```

## Notes

- The extension runtime uses `sidepanel.html` and the background service worker.
- Vite starter scaffolding files were removed because they were not part of the extension runtime.
- E2E tests live under `tests/e2e` for clear separation from any future unit tests.