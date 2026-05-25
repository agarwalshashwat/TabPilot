# Contributing

Thanks for contributing to TabPilot.

## Development Setup

1. Install Node.js 22.12+ and npm 10+ (Tested on Node 22 and 26)
2. Install dependencies:

   npm install

3. Run checks:

   npm run format:check
   npm run lint
   npm run build
   npm test

4. Load extension in Chrome:

- Open chrome://extensions
- Enable Developer mode
- Load unpacked from this project root

## Branch and Commits

- Branch naming: feature/, fix/, docs/, chore/
- Commit style: Conventional Commits preferred

Examples:

- feat: add provider warning in settings
- fix: handle disconnected port cleanup
- docs: add security policy

## Pull Requests

Please include:

- What changed and why
- Screenshots for UI changes
- Validation steps and results
- Linked issue if applicable

## Project Structure

- See `docs/project-structure.md` for the canonical repository layout.
- E2E tests are under `tests/e2e`.
- Sidepanel UI code is under `src/sidepanel` and worker code is under `src/background`.

## Add A Platform Without Core Code Changes

Use the platform pack workflow to extend behavior for your own websites/use cases:

1. Start from `src/background/platforms/data/pack-template.json`.
2. Add a new playbook object into `src/background/platforms/data/playbooks.json`.
3. Add platform notes from `docs/platform-playbooks/pack-template.md`.
4. Keep selectors/hints/policies inside the pack; avoid editing worker/planner/executor unless adding new generic capabilities.
5. Run:
   - `npm run typecheck`
   - `npm run format:check`

If a playbook is invalid, TabPilot skips it and prints diagnostics under `[TAP][platforms]` in extension logs.

## Testing Guidance

- Keep deterministic checks in CI
- Run manual GUI validation on active macOS space for extension UI flows
- Do not rely on cross-space window visibility for pass/fail automation

## CUA-Driver Workflow Note

When using native app automation tooling, use the standard loop:

1. snapshot current window state
2. apply one interaction
3. re-snapshot and verify

This avoids hidden state drift and keeps actions auditable.

## Security

Read SECURITY.md before reporting vulnerabilities.

## License

By contributing, you agree your contributions are licensed under MIT.
