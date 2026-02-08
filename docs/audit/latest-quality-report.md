# Repository Quality Audit Report

- Generated at: 2026-02-08 18:53:45 UTC
- Repository: `/Users/philipcole/Codebase/CelestialCMS`
- Budget config: `scripts/quality/quality_budget.json`
- Total findings: **48**

## Findings by Category

- `broad_exception`: 32
- `large_file`: 15
- `core_modules_dependency`: 1

## Top Paths

- `apps/api/core/middleware/locale.py`: 3
- `apps/api/core/logging.py`: 2
- `apps/api/common/utils/public_ids.py`: 2
- `apps/api/modules/analytics/bootstrap.py`: 2
- `apps/web/portal/src/features/editor-host/editor-host-page.tsx`: 1
- `apps/web/admin/src/components/ui/sidebar.tsx`: 1
- `apps/web/admin/src/components/ui/effect-highlight.tsx`: 1
- `apps/web/admin/src/components/common/settings/general/tabs/site-settings-tab.tsx`: 1
- `apps/web/admin/src/components/common/assets/asset-masonry-card.tsx`: 1
- `apps/web/admin/src/pages/plugins/installed/page.tsx`: 1

## Detailed Findings

| Severity | Category | Location | Message |
| --- | --- | --- | --- |
| high | `core_modules_dependency` | `apps/api/core/middleware/locale.py:111` | core layer directly depends on modules layer |
| high | `large_file` | `apps/api/common/email/service.py:1` | 815 lines exceeds budget 800 |
| high | `large_file` | `apps/api/config.py:1` | 1111 lines exceeds budget 800 |
| high | `large_file` | `apps/api/modules/workspaces/team/service.py:1` | 1073 lines exceeds budget 800 |
| high | `large_file` | `apps/api/tests/modules/workspaces/test_workspace_team_invites_v2_integration.py:1` | 1049 lines exceeds budget 800 |
| high | `large_file` | `apps/web/admin/src/components/common/assets/asset-masonry-card.tsx:1` | 1492 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/components/common/settings/general/tabs/site-settings-tab.tsx:1` | 655 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/components/ui/effect-highlight.tsx:1` | 608 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/components/ui/sidebar.tsx:1` | 778 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/pages/accept-invite/page.tsx:1` | 752 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/pages/assets/page.tsx:1` | 1549 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/pages/plugins/installed/page.tsx:1` | 645 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/pages/team/invitations/page.tsx:1` | 896 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/pages/team/members/page.tsx:1` | 631 lines exceeds budget 600 |
| high | `large_file` | `apps/web/admin/src/pages/team/roles/page.tsx:1` | 937 lines exceeds budget 600 |
| high | `large_file` | `apps/web/portal/src/features/editor-host/editor-host-page.tsx:1` | 872 lines exceeds budget 600 |
| medium | `broad_exception` | `apps/api/common/types/public_uuid.py:26` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/utils/ids.py:7` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/utils/public_ids.py:104` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/utils/public_ids.py:116` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/utils/redact.py:28` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/http/response.py:35` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/i18n.py:60` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/logging.py:193` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/logging.py:384` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/middleware/locale.py:89` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/middleware/locale.py:106` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/registry.py:68` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/assets/thumbnails.py:37` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/jobs/analytics_retention.py:66` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/storage/local.py:91` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/storage/merge.py:42` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/storage/s3.py:137` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/analytics/bootstrap.py:26` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/analytics/bootstrap.py:36` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/sso/exchange_store.py:99` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/organization/deps.py:30` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/organization/runtime.py:17` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/service.py:223` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/stores.py:126` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/mail/service.py:35` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/settings/service.py:237` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/deps.py:100` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/invitations/tokens.py:87` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/rbac/service.py:66` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/restart.py:93` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/routes.py:71` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/watch.py:101` | broad exception handler (except Exception) |

## Notes

- This audit highlights structural and maintainability risks, not runtime correctness.
- Use this report as a triage queue; prioritize high-severity findings first.
- For each accepted finding, create a tracked task with owner, target date, and test plan.
