# Quality Audit Scripts

This directory contains repository-wide quality audit tooling.

## Why this directory exists

The project now uses explicit quality gates to prevent architectural drift and hidden maintenance debt. The scripts here are intentionally lightweight and dependency-free so they can run in local environments and CI.

## Files

- `audit_repo.py`: Generates markdown + CSV audit reports and optionally exits with failure when findings exist.
- `quality_budget.json`: Stores budget thresholds and scan roots.

## Usage

From repository root:

```bash
python3 scripts/quality/audit_repo.py --repo-root .
```

This writes:
- `docs/audit/latest-quality-report.md`
- `docs/audit/latest-quality-report.csv`

Generate report and fail on findings:

```bash
python3 scripts/quality/audit_repo.py --repo-root . --fail-on-findings
```

## Scope of current checks

- Large-file budgets (`.py`, `.ts`, `.tsx`, `.js`, `.jsx`)
- Frontend `any` usage markers
- Python broad exception handlers (`except Exception`)
- Forbidden dependency direction: `apps/api/core` importing `apps/api/modules`

These checks are intentionally conservative and can be evolved through `quality_budget.json`.
