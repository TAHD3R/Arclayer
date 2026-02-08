# Repository Quality Audit Report

- Generated at: 2026-02-08 19:50:54 UTC
- Repository: `/Users/philipcole/Codebase/CelestialCMS`
- Budget config: `scripts/quality/quality_budget.json`
- Total findings: **6**

## Findings by Category

- `large_file`: 6

## Top Paths

- `apps/web/portal/src/features/editor-host/editor-host-page.tsx`: 1
- `apps/web/admin/src/components/common/assets/asset-masonry-card.tsx`: 1
- `apps/web/admin/src/pages/team/roles/page.tsx`: 1
- `apps/web/admin/src/pages/team/invitations/page.tsx`: 1
- `apps/web/admin/src/pages/assets/page.tsx`: 1
- `apps/api/modules/workspaces/team/service.py`: 1

## Detailed Findings

| Severity | Category | Location | Message |
| --- | --- | --- | --- |
| high | `large_file` | `apps/api/modules/workspaces/team/service.py:1` | 1073 lines exceeds budget 800 |
| high | `large_file` | `apps/web/admin/src/components/common/assets/asset-masonry-card.tsx:1` | 1492 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/pages/assets/page.tsx:1` | 1549 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/pages/team/invitations/page.tsx:1` | 896 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/pages/team/roles/page.tsx:1` | 937 lines exceeds budget 600 |
| high | `large_file` | `apps/web/portal/src/features/editor-host/editor-host-page.tsx:1` | 872 lines exceeds budget 600 |

## Notes

- This audit highlights structural and maintainability risks, not runtime correctness.
- Use this report as a triage queue; prioritize high-severity findings first.
- For each accepted finding, create a tracked task with owner, target date, and test plan.
