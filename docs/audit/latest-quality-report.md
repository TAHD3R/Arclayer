# Repository Quality Audit Report

- Generated at: 2026-02-08 17:15:17 UTC
- Repository: `/Users/philipcole/Codebase/CelestialCMS`
- Budget config: `scripts/quality/quality_budget.json`
- Total findings: **162**

## Findings by Category

- `broad_exception`: 147
- `large_file`: 14
- `core_modules_dependency`: 1

## Top Paths

- `apps/api/plugin/manager.py`: 12
- `apps/api/modules/workspaces/themes/service.py`: 8
- `plugins/plugin-oauth-social/src/oauth_social/service.py`: 7
- `apps/api/infra/jobs/worker.py`: 6
- `apps/api/modules/assets/bootstrap.py`: 6
- `apps/api/modules/workspaces/team/service.py`: 5
- `apps/api/core/database/orm.py`: 5
- `apps/api/common/email/service.py`: 5
- `apps/api/modules/workspaces/rbac/router.py`: 5
- `apps/api/modules/system/admin/menus/service.py`: 5

## Detailed Findings

| Severity | Category | Location | Message |
| --- | --- | --- | --- |
| high | `core_modules_dependency` | `apps/api/core/middleware/locale.py:111` | core layer directly depends on modules layer |
| high | `large_file` | `apps/api/config.py:1` | 1111 lines exceeds budget 800 |
| high | `large_file` | `apps/api/modules/workspaces/team/service.py:1` | 1044 lines exceeds budget 800 |
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
| medium | `broad_exception` | `apps/api/bootstrap.py:57` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/bootstrap.py:76` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/email/service.py:172` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/email/service.py:314` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/email/service.py:405` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/email/service.py:573` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/email/service.py:760` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/types/public_uuid.py:26` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/utils/ids.py:7` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/utils/public_ids.py:104` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/utils/public_ids.py:116` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/common/utils/redact.py:28` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/database/orm.py:198` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/database/orm.py:220` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/database/orm.py:235` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/database/orm.py:259` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/database/orm.py:302` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/http/response.py:35` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/i18n.py:60` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/logging.py:193` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/logging.py:384` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/middleware/locale.py:89` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/middleware/locale.py:106` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/core/registry.py:68` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/assets/thumbnails.py:37` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/cache/valkey.py:20` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/cache/valkey.py:257` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/cache/valkey.py:273` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/cache/valkey.py:293` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/jobs/analytics_retention.py:66` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/jobs/worker.py:44` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/jobs/worker.py:70` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/jobs/worker.py:82` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/jobs/worker.py:92` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/jobs/worker.py:109` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/jobs/worker.py:129` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/storage/local.py:91` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/storage/merge.py:42` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/infra/storage/s3.py:137` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/analytics/bootstrap.py:26` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/analytics/bootstrap.py:36` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/analytics/ingest.py:187` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/analytics/ingest.py:200` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/analytics/ingest.py:206` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/analytics/ingest.py:222` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/analytics/ingest.py:337` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/assets/bootstrap.py:74` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/assets/bootstrap.py:84` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/assets/bootstrap.py:127` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/assets/bootstrap.py:133` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/assets/bootstrap.py:138` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/assets/bootstrap.py:153` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/assets/service.py:98` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/assets/service.py:140` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/assets/service.py:214` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/invitation_acceptance_service.py:279` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/invitation_acceptance_service.py:304` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/invitation_acceptance_service.py:332` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/invitation_acceptance_service.py:546` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/service.py:192` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/service.py:270` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/service.py:474` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/service.py:570` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/sso/exchange_store.py:99` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/sso/service.py:109` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/sso/service.py:131` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/auth/sso/service.py:168` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/organization/deps.py:30` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/organization/plugins/service.py:34` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/organization/plugins/service.py:84` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/organization/runtime.py:17` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/shares/service.py:66` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/shares/service.py:121` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/portal_extensions/service.py:36` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/portal_extensions/service.py:62` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/repository.py:243` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/repository.py:278` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/repository.py:311` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/repository_publishing.py:92` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/repository_publishing.py:105` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/service.py:223` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/sites/stores.py:126` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/admin/extensions/service.py:44` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/admin/extensions/service.py:57` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/admin/menus/service.py:76` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/admin/menus/service.py:150` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/admin/menus/service.py:311` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/admin/menus/service.py:423` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/admin/menus/service.py:432` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/mail/service.py:35` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/plugins_manager/service.py:192` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/plugins_manager/service.py:261` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/service.py:185` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/service.py:206` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/service.py:280` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/system/settings/service.py:237` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/deps.py:100` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/invitations/tokens.py:87` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/rbac/router.py:159` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/rbac/router.py:199` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/rbac/router.py:232` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/rbac/router.py:274` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/rbac/router.py:318` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/rbac/service.py:66` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/team/service.py:110` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/team/service.py:341` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/team/service.py:417` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/team/service.py:425` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/themes/service.py:143` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/themes/service.py:256` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/themes/service.py:306` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/themes/service.py:355` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/themes/service.py:360` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/themes/service.py:415` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/themes/service.py:423` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/modules/workspaces/themes/service.py:453` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/deps.py:39` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/deps.py:61` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/event_bus.py:173` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/event_bus.py:204` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:205` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:247` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:301` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:473` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:487` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:492` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:497` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:510` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:516` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:520` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:582` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/manager.py:657` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/restart.py:93` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/routes.py:71` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/plugin/watch.py:101` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/settings/runtime.py:101` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/settings/runtime.py:121` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/settings/runtime_plugins.py:81` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/settings/runtime_plugins.py:89` | broad exception handler (except Exception) |
| medium | `broad_exception` | `apps/api/settings/runtime_plugins.py:115` | broad exception handler (except Exception) |
| medium | `broad_exception` | `plugins/plugin-oauth-social/src/oauth_social/service.py:193` | broad exception handler (except Exception) |
| medium | `broad_exception` | `plugins/plugin-oauth-social/src/oauth_social/service.py:297` | broad exception handler (except Exception) |
| medium | `broad_exception` | `plugins/plugin-oauth-social/src/oauth_social/service.py:358` | broad exception handler (except Exception) |
| medium | `broad_exception` | `plugins/plugin-oauth-social/src/oauth_social/service.py:383` | broad exception handler (except Exception) |
| medium | `broad_exception` | `plugins/plugin-oauth-social/src/oauth_social/service.py:385` | broad exception handler (except Exception) |
| medium | `broad_exception` | `plugins/plugin-oauth-social/src/oauth_social/service.py:403` | broad exception handler (except Exception) |
| medium | `broad_exception` | `plugins/plugin-oauth-social/src/oauth_social/service.py:437` | broad exception handler (except Exception) |

## Notes

- This audit highlights structural and maintainability risks, not runtime correctness.
- Use this report as a triage queue; prioritize high-severity findings first.
- For each accepted finding, create a tracked task with owner, target date, and test plan.
