# Support

## Getting Help

- Usage and setup: open a GitHub Discussion
- Bug reports: use the bug issue template
- Security issues: follow SECURITY.md

## Scope

Current supported release scope:

- Chrome extension runtime (Manifest V3)
- Chrome 138+
- GitHub source release and Chrome Web Store distribution

Not in v1 support scope:

- Safari packaging/runtime parity
- Cross-space GUI automation guarantees on macOS

## Operational Notes

For GUI automation validation, keep the target browser window in the active
macOS space. Cross-space visibility/focus behavior can vary by system settings
and is not treated as a deterministic test surface.
