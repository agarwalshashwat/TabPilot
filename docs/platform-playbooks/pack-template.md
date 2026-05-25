# Platform Pack Template

Use this file as a starter for documenting a new platform pack.

## Platform

- Pack id: `my-platform`
- Runtime file: `src/background/platforms/data/playbooks.json` (add your pack object)
- Doc file: `docs/platform-playbooks/my-platform.md`

## Goal

Describe the user tasks this platform pack should optimize.

## Stable Selectors

List the selectors that are stable enough to use as aliases:

- `searchInput`: `input[name=\"q\"]`
- `resultItem`: `.result-card`
- `resultLink`: `.result-card a`

## Planning Rules

- Explain how search/navigation should be sequenced.
- Explain what the planner should avoid.

## Recovery Rules

- Explain how retries should pivot when first execution fails.
- Include known anti-patterns to avoid.

## Verification Rules

- Define what success means for this platform.
- Include URL/state checks and content checks.

## Debug Notes

Add known quirks, unstable UI regions, localization issues, and recent selector changes.

## Validation Checklist

1. Add the runtime pack object to `playbooks.json`.
2. Run `npm run typecheck`.
3. Run `npm run format:check`.
4. Run a targeted manual or e2e task on the platform.
