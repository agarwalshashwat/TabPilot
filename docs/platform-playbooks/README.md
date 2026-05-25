# Platform Playbooks

This folder contains human-readable guidance for platform-specific automation behavior.

Design:

- Runtime rules live in [src/background/platforms/data/playbooks.json](../../src/background/platforms/data/playbooks.json).
- Developer context and rationale live in Markdown files in this folder.

Pack contract (v1):

- `specVersion`: must be `1.0.0`.
- `minTabPilotVersion`: minimum compatible TabPilot version for this pack.
- `documentationPath`: relative path to the platform Markdown notes.
- `executionPolicy` (optional): declarative behavior controls used by runtime logic.

Open-source extension workflow (no core code changes required):

1. Copy [src/background/platforms/data/pack-template.json](../../src/background/platforms/data/pack-template.json).
2. Add your new platform object to [src/background/platforms/data/playbooks.json](../../src/background/platforms/data/playbooks.json).
3. Copy [docs/platform-playbooks/pack-template.md](pack-template.md) and create your platform doc.
4. Run `npm run typecheck` and `npm run format:check`.
5. Validate one task scenario for your platform.

Notes:

- Invalid packs are skipped at load time with diagnostics in `[TAP][platforms]` logs.
- Custom packs should use unique `id` values and platform-specific selector aliases.

How to update a platform:

1. Update machine hints/selectors in the JSON playbook.
2. Update the corresponding Markdown note with rationale, quirks, and validation notes.
3. Run `npm run typecheck` and targeted repro tests.

Initial platform notes:

- [YouTube](youtube.md)
