# @celestial/config

Shared Oxlint/Oxfmt configuration for the monorepo.

Why this package exists
- Avoid hard-coded relative paths in app scripts (e.g. `../../../.oxlintrc.json`).
- Keep lint/format config discoverable and versioned in the workspace.

Usage
- `oxlint -c ./node_modules/@celestial/config/.oxlintrc.json .`
- `oxfmt -c ./node_modules/@celestial/config/.oxfmtrc.json .`
