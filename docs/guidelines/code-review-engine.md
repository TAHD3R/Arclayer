# Code Review Engine Guide

This file is a **tool-specific** guide for `scripts/code-review-engine`.
It is not a repository-wide implementation contract source.

## Purpose

The Code Review Engine audits repository standards and emits actionable findings.
Target location:

```text
scripts/code-review-engine/
```

## CLI Contract

Supported shapes:

```bash
pnpm code-review-engine --scope full --format human
pnpm code-review-engine --scope backend --format json
pnpm code-review-engine --scope module --module analytics --format json
pnpm code-review-engine --scope changed --base develop --format json
pnpm code-review-engine --rules service.no-direct-orm,frontend.route-no-api-calls --format json
pnpm code-review-engine --scope full --format markdown --output output/code-review-engine/full.md
```

CLI behavior:

- non-zero exit only when a `blocking`-stability rule emits a `BLOCKER` finding
- non-zero exit on invalid scope or malformed config input
- stdout output plus report artifact emission

## Scope Model

Supported scopes:

- `full`
- `backend`
- `frontend`
- `module`
- `package`
- `changed`
- `rules`

## Enforcement Model

- `prototype` and `active` rules are report-only.
- `blocking` rules may fail automation when they emit `BLOCKER` findings.
- Baseline suppression and waiver flags are not exposed; unsupported behavior must not appear as a no-op option.

## Rule Catalog Ownership

Rule metadata, categories, severities, and promotion policy are owned by the engine implementation under `scripts/code-review-engine/src/code_review_engine/**`.

Repository-wide implementation contracts remain in `docs/spec/**`.
