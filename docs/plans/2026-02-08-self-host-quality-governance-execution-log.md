# Self-host Quality Governance Execution Log

> Master Plan: `docs/plans/2026-02-08-self-host-quality-governance-master-plan.md`

## 2026-02-08 - Kickoff

### Completed

1. Saved and finalized the master plan in docs.
2. Established audit governance artifacts and machine reports.
3. Started Phase 1 remediation with a low-risk frontend quality patch:
   - Removed redundant boolean casts in plugin detail pages.
   - Verified admin lint is now clean.

### Evidence

- `apps/web/admin/src/routes/w/$workspaceId/plugins/$pluginSlug/index.tsx`
- `apps/web/admin/src/pages/plugins/organization-plugin-detail/page.tsx`
- `docs/audit/latest-quality-report.md`

### Verification

- `pnpm --filter @celestial/admin lint` => 0 warnings / 0 errors
- `pnpm audit:quality` => report regenerated

### Next

1. Phase 1 / WP-1: remove `core -> modules` direct imports in startup path.
2. Phase 1 / WP-2: begin backend large-file decomposition (auth/sites).


## 2026-02-08 - WP-1 Core Boundary Refactor

### Completed

1. Removed direct `apps.api.modules.*` imports from `apps/api/core/registry.py`.
2. Introduced an application-level bootstrap boundary:
   - `apps/api/app_bootstrap.py`
   - `apps/api/app_middleware.py`
3. Kept startup/shutdown behavior equivalent (activity ingest, seed sync, demo site bootstrap, locale middleware resolution).

### Verification

- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api exec uv run ruff check app_bootstrap.py app_middleware.py core/registry.py` => passed
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => findings reduced from 279 to 271
- `core_modules_dependency` category removed from report

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`: `ISS-0003` marked as `done`.

### Next

1. Phase 1 / WP-2: split backend large files (auth/sites/plugins_manager).
2. Phase 1 / WP-3: start highest-frequency frontend `any` cleanup cluster.


## 2026-02-08 - WP-2 Auth Decomposition (Invitation Domain)

### Completed

1. Continued auth service拆分，邀请相关逻辑从 `AuthService` 进一步下沉：
   - `apps/api/modules/auth/invitation_service.py` 负责 invitation query/preview + policy。
   - `apps/api/modules/auth/invitation_acceptance_service.py` 新增，承载 invitation acceptance flow。
2. `apps/api/modules/auth/service.py` 保持 orchestrator 职责，通过组合方式委托 invitation 子服务。
3. 修复审查脚本跨环境兼容性：
   - `scripts/quality/audit_repo.py` 从 `datetime.UTC` 改为 `timezone.utc`，兼容系统 Python 3.9。

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check app_bootstrap.py app_middleware.py core/registry.py modules/auth/service.py modules/auth/invitation_service.py modules/auth/invitation_acceptance_service.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api exec uv run pytest tests/modules/auth -q` => passed (with expected integration skips)
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped (one run observed flaky failure in `test_public_id_tamper_never_decodes_to_original_uuid`, rerun passed)
- `pnpm audit:quality` => findings reduced from 271 to 270

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0004` marked `done` (auth service file-budget target met)
  - `ISS-0026` added (probabilistic tamper test flakiness)

### Next

1. Phase 1 / WP-2: continue large-file split for `sites/service.py`, `sites/repository.py`, `plugins_manager/service.py`.
2. Phase 1 / WP-3: continue frontend `any` hotspot reduction.
3. Phase 1 / WP-4: start replacing broad exception blocks in auth/assets/plugin flows with structured, contextual logging.


## 2026-02-08 - WP-2 Sites Service Decomposition (Publishing/Resolve)

### Completed

1. Split publishing + revision + route resolve + presence + sitemap responsibilities out of `SiteService`:
   - Added `apps/api/modules/sites/publishing_service.py`.
   - `apps/api/modules/sites/service.py` now delegates those responsibilities to `SitePublishingService`.
2. Kept external API contracts unchanged (router/service method signatures remain stable).
3. Reduced `apps/api/modules/sites/service.py` size significantly:
   - `1539` -> `1010` lines.

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check modules/sites/service.py modules/sites/publishing_service.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api exec uv run pytest tests/modules/sites -q` => passed (integration skips expected)
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => report regenerated, total findings `270`

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0005` updated to reflect partial decomposition progress (still open, still above budget).

### Next

1. Continue Phase 1 / WP-2 on `apps/api/modules/sites/repository.py`.
2. Then proceed with `apps/api/modules/system/plugins_manager/service.py` decomposition.
3. Keep Phase 1 / WP-3 frontend `any` reduction in parallel.


## 2026-02-08 - WP-2 Sites Repository Decomposition (Publishing/Routing)

### Completed

1. Split monolithic sites repository into focused components:
   - Added `apps/api/modules/sites/repository_publishing.py` for revision publish/rollback and deps validation.
   - Added `apps/api/modules/sites/repository_routing.py` for route-template matcher/cache and sitemap path resolution.
   - `apps/api/modules/sites/repository.py` now acts as a thin façade and keeps compatibility exports for matcher helper tests.
2. Reduced repository file size:
   - `apps/api/modules/sites/repository.py`: `1384` -> `722` lines (now within budget).

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check modules/sites/repository.py modules/sites/repository_publishing.py modules/sites/repository_routing.py modules/sites/service.py modules/sites/publishing_service.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api exec uv run pytest tests/modules/sites -q` => passed (integration skips expected)
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => total findings `269`, large_file `16`

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0006` marked `done`.

### Next

1. Continue Phase 1 / WP-2 on `apps/api/modules/sites/service.py` (still above budget at `1010` lines).
2. Then proceed with `apps/api/modules/system/plugins_manager/service.py` decomposition.
3. Continue Phase 1 / WP-3 frontend `any` reduction in parallel.


## 2026-02-08 - WP-2 Sites Service Decomposition (Content Domain)

### Completed

1. Continued sites domain decomposition by extracting content-management responsibilities into a dedicated service:
   - Added `apps/api/modules/sites/content_service.py`.
   - Moved page/entry/route-template CRUD and cache-version bump logic out of `SiteService`.
2. Kept `apps/api/modules/sites/service.py` as orchestration façade:
   - Delegates content operations to `SiteContentService`.
   - Delegates publishing/revision/resolve/presence/sitemap operations to `SitePublishingService`.
3. Reduced sites service file size to budget:
   - `apps/api/modules/sites/service.py`: `1010` -> `500` lines.

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check modules/sites/service.py modules/sites/content_service.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api exec uv run pytest tests/modules/sites -q` => passed (integration skips expected)
- `pnpm --filter @celestial/api test` => failed on existing `tests/common/test_public_ids_codec_unit.py::test_public_id_tamper_never_decodes_to_original_uuid` (tracked in issue register, unrelated to sites refactor)
- `pnpm audit:quality` => total findings `268`, `large_file` reduced to `15`

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0005` marked `done` (sites service file-budget target met).

### Next

1. Continue Phase 1 / WP-2 on `apps/api/modules/system/plugins_manager/service.py` decomposition.
2. Continue Phase 1 / WP-3 frontend `any` hotspot reduction.
3. Address `ISS-0026` test instability to restore full-suite green baseline.


## 2026-02-08 - WP-2 Plugins Manager Decomposition + WP-3 Any Cleanup + ISS-0026 Stabilization

### Completed

1. Decomposed plugin manager service by extracting install/staging/zip-security flow:
   - Added `apps/api/modules/system/plugins_manager/install_service.py`.
   - `apps/api/modules/system/plugins_manager/service.py` now keeps orchestration/detail/config concerns and delegates installation flow.
   - Preserved compatibility wrappers for test-facing helper methods (`_validate_zip`, `_safe_extract`, `_save_upload`, etc.).
2. Reduced plugin manager service file size to budget:
   - `apps/api/modules/system/plugins_manager/service.py`: `1154` -> `518` lines.
3. Cleaned frontend `any` hotspots in the targeted cluster:
   - `apps/web/admin/src/layouts/admin-layout.tsx`
   - `apps/web/admin/src/pages/assets/page.tsx`
   - `apps/web/admin/src/components/activity/activity-filter-popover.tsx`
   - plus readonly-nav type plumbing in nav/header/command menu components.
4. Fixed flaky test `ISS-0026`:
   - Updated tamper test to mutate a deterministic non-padding base64url position.
   - `tests/common/test_public_ids_codec_unit.py` no longer fails intermittently on unchanged UUID decode edge-case.

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check modules/system/plugins_manager/service.py modules/system/plugins_manager/install_service.py modules/sites/service.py modules/sites/content_service.py tests/common/test_public_ids_codec_unit.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api exec uv run pytest tests/plugin/test_plugin_package_security.py tests/modules/system/test_plugin_validate_staging_unit.py tests/common/test_public_ids_codec_unit.py -q` => passed
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm --filter @celestial/admin typecheck` => passed
- `pnpm --filter @celestial/admin lint` => 0 warnings / 0 errors
- `pnpm audit:quality` => total findings `248`, `frontend_any` `61`, `large_file` `14`

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0007` marked `done` (plugins manager file-budget target met)
  - `ISS-0011` / `ISS-0012` / `ISS-0013` marked `done` (targeted frontend any hotspots resolved)
  - `ISS-0026` marked `done` (flaky test stabilized)

### Next

1. Continue Phase 1 / WP-4: reduce broad exception density in plugin/assets/auth hotspots with structured context logging.
2. Continue Phase 1 / WP-3: clean remaining frontend any hotspots (assets/team/activity long-tail).
3. Start preparing Phase 2 architecture docs for API Keys/Webhooks/Integrations implementation sequence.

## 2026-02-08 - WP-4 Broad Exception Hardening (plugin/assets/auth) + WP-3 Long-tail Any Cleanup

### Completed

1. Continued WP-4 hardening with structured contextual logging in high-frequency best-effort paths:
   - `apps/api/modules/system/plugins_manager/service.py`
     - Added contextual warning logs for plugin settings event publish failures.
     - Narrowed dependency comparison fallback from `(InvalidVersion, Exception)` to explicit version/specifier parsing errors.
     - Narrowed manifest load fallback to explicit IO/decode/validation exceptions with path context.
   - `apps/api/modules/system/plugins_manager/install_service.py`
     - Replaced silent rollback/metadata catch blocks with structured warning logs (`plugin_id`, `token`, `action`, `error`).
   - `apps/api/modules/assets/admin/uploads/service.py`
     - Added contextual warning logs for complete/abort/publish/cleanup best-effort paths.
     - Preserved graceful degradation while removing silent exception swallowing.
   - `apps/api/modules/auth/service.py`
     - Narrowed token-version coercion fallback to `TypeError/ValueError`.
     - Replaced silent auth event publish catches with contextual warning logs.
2. Continued WP-3 long-tail frontend typing cleanup (removed remaining targeted `any` usage):
   - `apps/web/admin/src/components/common/assets/assets-filter-popover.tsx`
   - `apps/web/admin/src/pages/team/invitations/page.tsx`
   - `apps/web/admin/src/pages/team/roles/page.tsx`
   - `apps/web/admin/src/pages/team/members/page.tsx`
   - `apps/web/admin/src/components/activity/activity-detail-dialog.tsx`
3. Regenerated repository quality report after this batch.

### Verification

- `pnpm --filter @celestial/admin lint` => 0 warnings / 0 errors
- `pnpm --filter @celestial/admin typecheck` => passed
- `pnpm --filter @celestial/api exec uv run ruff check modules/system/plugins_manager/service.py modules/system/plugins_manager/install_service.py modules/assets/admin/uploads/service.py modules/auth/service.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => total findings `234` (`frontend_any` `51`, `broad_exception` `169`, `large_file` `14`)

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0015` updated to `in_progress` (auth broad-exception remediation progressed with structured context logging)
  - `ISS-0016` updated to `in_progress` (uploads broad-exception remediation progressed with structured context logging)

### Next

1. Continue WP-4: reduce residual broad exceptions in `uploads/service.py` and `plugins_manager/install_service.py` by splitting cleanup/recovery helpers and narrowing catch classes where safe.
2. Continue WP-3: eliminate remaining frontend any findings (`51` -> target continuous decline) with focus on team/assets clusters.
3. Start WP-5 overlap cleanup for duplicated plugin-detail presentation after WP-4 residual risk is lowered.

## 2026-02-08 - WP-4 Residual Exception Compression + WP-3 Team/Assets Any + WP-5 Plugin Detail Dedup

### Completed

1. Continued WP-4 residual exception治理（uploads/install_service优先）:
   - `apps/api/modules/assets/admin/uploads/service.py`
     - Extracted reusable `_build_s3_provider(...)` to集中 provider build failure handling with structured context.
     - Reused helper in `init_upload` / `presign_part` / `_complete_s3` / `abort` to reduce duplicated broad catches.
     - Narrowed local filesystem cleanup catches to `OSError` in merge/hash mismatch/part cleanup/abort tmp cleanup paths.
   - `apps/api/modules/system/plugins_manager/install_service.py`
     - Extracted rollback helpers (`_cleanup_target_dir`, `_restore_backup_dir`, `_reenable_plugin_after_failure`) to simplify install failure recovery flow.
     - Narrowed filesystem swap/restore catches from broad `Exception` to `OSError | shutil.Error` where safe.
     - Kept best-effort plugin runtime recovery with structured context logs.
2. Continued WP-3 long-tail frontend typing cleanup（team/assets优先）:
   - `apps/web/admin/src/components/common/assets/asset-masonry-card.tsx`
   - `apps/web/admin/src/components/common/team/invite-members-dialog.tsx`
   Removed remaining target `any` usage in these hotspots.
3. Completed WP-5 plugin detail dedup:
   - Added shared presentation module: `apps/web/admin/src/components/plugins/plugin-detail-page.tsx`.
   - Refactored both containers to reuse shared rendering:
     - `apps/web/admin/src/pages/plugins/organization-plugin-detail/page.tsx`
     - `apps/web/admin/src/routes/w/$workspaceId/plugins/$pluginSlug/index.tsx`
4. Restored API baseline check break caused by stale import:
   - Removed unused `apps.api.app_middleware` import from `apps/api/core/registry.py`.

### Verification

- `pnpm --filter @celestial/admin typecheck` => passed
- `pnpm --filter @celestial/admin lint` => 0 warnings / 0 errors
- `pnpm --filter @celestial/api exec uv run ruff check modules/system/plugins_manager/install_service.py modules/assets/admin/uploads/service.py modules/system/plugins_manager/service.py modules/auth/service.py core/registry.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => total findings `222` (`broad_exception` `158`, `frontend_any` `49`, `large_file` `14`)

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0015` remains `in_progress` with updated scope/location (auth residual broad exception cleanup)
  - `ISS-0016` remains `in_progress` with updated scope/location (uploads residual broad exception cleanup)
  - `ISS-0024` marked `done` (workspace/org plugin detail dedup completed)

### Next

1. Continue WP-4: further narrow remaining broad catches in `uploads/service.py` and `plugins_manager/install_service.py` (event publish + fail-safe rollback paths).
2. Continue WP-3: move from team/assets hotspots to remaining admin infra hotspots (`settings/utils`, `zod-resolver`, root route runtime hooks).
3. Start Phase 2 prep doc for API Keys/Webhooks/Integrations domain decomposition and delivery slices.

## 2026-02-08 - WP-4 Narrowing Pass + WP-3 Admin Any Zeroing

### Completed

1. Continued WP-4 narrowing for residual exception hotspots:
   - `apps/api/modules/assets/admin/uploads/service.py`
     - Narrowed S3 provider build catch to `TypeError | ValueError` in `_build_s3_provider`.
     - Narrowed local merge failure catch to `OSError`.
   - `apps/api/modules/system/plugins_manager/install_service.py`
     - Removed remaining broad `except Exception` handlers.
     - Narrowed lifecycle/install persistence/best-effort paths to explicit exception sets (`IntegrityError`, `OperationalError`, `ValidationError`, etc.).
2. Continued WP-3 typing cleanup across admin long-tail hotspots and removed all admin-scoped audit `frontend_any` findings:
   - assets/setup/ui/runtime helpers cleaned (`asset-picker-dialog`, `setup-defaults-step`, `animate-slot`, `color-bends`, `effect-highlight`, `headless-accordion`, `theme-transition`).
   - hooks/forms/query/settings/store routing helpers cleaned (`use-workspace-*`, `zod-resolver`, `query-client`, `settings/general/utils`, `__root`, `use-preference-store`, `accept-invite`).
3. Regenerated audit artifacts and refreshed governance plan baseline block.

### Verification

- `pnpm --filter @celestial/admin typecheck` => passed
- `pnpm --filter @celestial/admin lint` => 0 warnings / 0 errors
- `pnpm --filter @celestial/api exec uv run ruff check modules/assets/admin/uploads/service.py modules/system/plugins_manager/install_service.py core/registry.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => total findings `188` (`broad_exception` `151`, `frontend_any` `22`, `large_file` `14`, `core_modules_dependency` `1`)

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0016` scope/location updated for residual uploads broad-exception envelope.
  - `ISS-0027` added to track remaining portal/runtime frontend-any cluster.
- `docs/plans/2026-02-08-self-host-quality-governance-master-plan.md`
  - latest baseline section synced to current audit numbers and next-focus priorities.

### Next

1. Continue WP-4 on residual broad catches in `uploads/service.py` (completion/status-reset/event publish envelopes) and auth/plugin long-tail.
2. Continue WP-3 on the remaining 22 findings in portal/runtime/site-renderer packages.
3. Tackle remaining `core_modules_dependency` in `apps/api/core/middleware/locale.py` to reopen Phase-1 gate.

## 2026-02-08 - WP-4 Uploads Residual Broad-Catch Closure + WP-3 Portal/Renderer Any Closure

### Completed

1. Closed WP-4 residual broad catches in uploads completion/event/abort envelopes:
   - `apps/api/modules/assets/admin/uploads/service.py`
     - Added explicit exception envelopes (`UPLOAD_COMPLETION_ERRORS`, `UPLOAD_STATUS_RESET_ERRORS`, `UPLOAD_EVENT_PUBLISH_ERRORS`, `UPLOAD_ABORT_ERRORS`).
     - Replaced remaining `except Exception` handlers in `complete()` and `abort()` best-effort paths with narrowed exception sets while preserving structured logs and idempotent behavior.
2. Closed WP-3 remaining frontend-any cluster in portal/runtime/renderer packages:
   - `apps/web/portal/renderer/+onRenderClient.tsx`
   - `apps/web/portal/renderer/+onRenderHtml.tsx`
   - `apps/web/portal/renderer/PageShell.tsx`
   - `apps/web/portal/src/runtime/__tests__/host-connector.test.ts`
   - `packages/site-renderer-core/src/internal/DocumentRenderer.tsx`
   - `packages/ui-theme/src/tailwind-preset.ts`
3. Synced governance artifacts after this batch.

### Verification

- `pnpm --filter @celestial/portal typecheck` => passed
- `pnpm --filter @celestial/portal lint` => 0 warnings / 0 errors
- `pnpm --filter @celestial/portal test -- host-connector.test.ts` => passed
- `pnpm --filter @celestial/api exec uv run ruff check modules/assets/admin/uploads/service.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => total findings `162` (`broad_exception` `147`, `frontend_any` `0`, `large_file` `14`, `core_modules_dependency` `1`)

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0016` marked `done` (uploads residual broad catches removed)
  - `ISS-0027` marked `done` (portal/runtime renderer any cluster removed)
- `docs/plans/2026-02-08-self-host-quality-governance-master-plan.md`
  - latest baseline and next-focus updated to reflect `frontend_any=0` and uploads residual closure.

### Next

1. Continue WP-4 broad-exception long-tail reduction in auth/plugin hotspots.
2. Continue WP-2 large-file decomposition queue (`assets/page`, `asset-masonry-card`, `team/*` pages).
3. Keep locale-middleware core-dependency item out of this execution lane per current direction.

## 2026-02-08 - WP-4 P0 Broad-Exception Sweep (plugin/themes/oauth/worker/assets/auth)

### Completed

1. Cleared the highest WP-4 hotspot `apps/api/plugin/manager.py` broad-exception cluster:
   - Replaced migration/version fallback `except Exception` with explicit envelopes.
   - Introduced fatal-error guard (`CancelledError`/system-exit path rethrow) for plugin lifecycle best-effort blocks.
   - Added structured warning logs for event publish and cleanup failure paths.
2. Closed workspace themes exception tails:
   - `apps/api/modules/workspaces/themes/service.py`
   - Replaced broad import/JSON/schema/provider catches with explicit typed envelopes (`ValidationError`, JSON parse errors, storage provider build errors).
3. Closed plugin ecosystem/auth/runtime long-tail hotspots:
   - `plugins/plugin-oauth-social/src/oauth_social/service.py`
   - `apps/api/infra/jobs/worker.py`
   - `apps/api/modules/assets/bootstrap.py`
   - `apps/api/modules/auth/service.py`
   - `apps/api/modules/auth/invitation_acceptance_service.py`
   - All residual `except Exception` in the above targets were removed and replaced by fatal-guarded best-effort handlers + contextual logs.
4. Regenerated repository audit artifacts after remediation batch.

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check plugin/manager.py modules/workspaces/themes/service.py infra/jobs/worker.py modules/assets/bootstrap.py modules/auth/service.py modules/auth/invitation_acceptance_service.py ../../plugins/plugin-oauth-social/src/oauth_social/service.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => total findings `115` (`broad_exception` `100`, `frontend_any` `0`, `large_file` `14`, `core_modules_dependency` `1`)

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - `ISS-0015` marked `done`
  - `ISS-0017` marked `done`
- `docs/plans/2026-02-08-self-host-quality-governance-master-plan.md`
  - latest baseline section synced from `162/147` to `115/100`.

### Next

1. Continue WP-4 P0 by attacking remaining top broad-exception density paths (`workspaces/team/service.py`, `core/database/orm.py`, `common/email/service.py`).
2. Resume WP-2 P0 large-file decomposition queue (`apps/web/admin/src/pages/assets/page.tsx`, `asset-masonry-card.tsx`, `team/roles/page.tsx`).
3. In upcoming batches, enforce the additional governance rules explicitly in code reviews/checks:
   - external-facing identifiers follow PublicUUID policy consistently;
   - activity/audit events use semantic event names and meaningful descriptions.

## 2026-02-08 - WP-4 P0 Continuation (team/orm/email/analytics)

### Completed

1. Continued WP-4 broad-exception reduction on the next top-density cluster:
   - `apps/api/modules/workspaces/team/service.py`
     - Replaced residual broad catches with typed/fatal-guarded handlers in activity publish, member-role snapshot, and subject id coercion paths.
   - `apps/api/core/database/orm.py`
     - Narrowed manifest parse fallback to explicit parse errors.
     - Replaced init/close/readiness/schema-fix broad catches with fatal-guarded envelopes and structured logs.
   - `apps/api/common/email/service.py`
     - Narrowed encrypted mail password decrypt fallback to explicit crypto/IO errors.
     - Replaced send-flow broad catches with fatal-guarded structured exception logs.
   - `apps/api/modules/analytics/ingest.py`
     - Replaced stop/flush loop broad catches with fatal-guarded best-effort logging and typed contextvars fallback.
2. Kept semantic activity event names unchanged and preserved existing best-effort delivery behavior.
3. Regenerated audit report after remediation batch.

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check common/email/service.py core/database/orm.py infra/jobs/worker.py modules/analytics/ingest.py modules/assets/bootstrap.py modules/auth/invitation_acceptance_service.py modules/auth/service.py modules/workspaces/team/service.py modules/workspaces/themes/service.py plugin/manager.py ../../plugins/plugin-oauth-social/src/oauth_social/service.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => total findings `97` (`broad_exception` `81`, `frontend_any` `0`, `large_file` `15`, `core_modules_dependency` `1`)

### Tracking updates

- `docs/audit/2026-02-08-issue-register.csv`
  - Added `ISS-0028` (email service file-budget overflow)
  - Added `ISS-0029` (workspace team service file-budget overflow)
- `docs/plans/2026-02-08-self-host-quality-governance-master-plan.md`
  - baseline synced to `97` findings / `81` broad exceptions.

### Next

1. Continue WP-4 P0 tail on `apps/api/modules/workspaces/rbac/router.py` and `apps/api/modules/system/admin/menus/service.py`.
2. Resume WP-2 P0 frontend large-file decomposition (`assets/page.tsx`, `asset-masonry-card.tsx`, `team/roles/page.tsx`).
3. Start backend large-file decomposition follow-up for new tracked hotspots (`ISS-0028`, `ISS-0029`) after frontend P0 queue stabilizes.

## 2026-02-08 - WP-4 P0 Continuation (rbac router + admin menus)

### Completed

1. Continued WP-4 long-tail reduction on the next two highest-density targets:
   - `apps/api/modules/workspaces/rbac/router.py`
     - Replaced five duplicated broad event-publish catches with a shared `_publish_rbac_event(...)` helper.
     - Added fatal cancellation propagation guard and contextual warning logs (`workspace_id`, `actor_user_id`, `event_name`).
   - `apps/api/modules/system/admin/menus/service.py`
     - Replaced plugin-state/core-heal broad catches with fatal-guarded best-effort handlers.
     - Added structured warning context for plugin-state loading and core-menu consistency/heal checks.
2. Preserved semantic activity/audit event names (no generic event-name regressions).
3. Regenerated quality audit artifacts.

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check modules/workspaces/rbac/router.py modules/system/admin/menus/service.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => total findings `87` (`broad_exception` `71`, `frontend_any` `0`, `large_file` `15`, `core_modules_dependency` `1`)

### Tracking updates

- `docs/plans/2026-02-08-self-host-quality-governance-master-plan.md`
  - baseline synced to `87` findings / `71` broad exceptions.

### Next

1. Continue WP-4 tail on `apps/api/infra/cache/valkey.py` and `apps/api/settings/runtime_plugins.py`.
2. Continue WP-4 on `apps/api/modules/auth/sso/service.py` and `apps/api/modules/system/service.py`.
3. Keep WP-2 P0 decomposition lane active (`apps/web/admin/src/pages/assets/page.tsx`, `asset-masonry-card.tsx`, `team/roles/page.tsx`) and then address backend large-file tail (`ISS-0028`, `ISS-0029`).

## 2026-02-08 - WP-4 P0 Continuation (auth-sso/sites/system/assets/plugin/runtime/bootstrap)

### Completed

1. Continued WP-4 broad-exception long-tail reduction on current top-density backend hotspots:
   - `apps/api/modules/auth/sso/service.py`
     - Replaced broad state lookup catch with typed envelope and contextual logs.
     - Added fatal-error guard for provider hook execution and retained fail-safe provider filtering.
   - `apps/api/modules/sites/repository.py`
     - Removed broad catches in settings snapshot and page visibility parsing.
     - Switched to typed visibility parse (`ValueError`) and deterministic timestamp fallback logic.
   - `apps/api/modules/system/service.py`
     - Removed broad catches in workspace core patch/event publish/default workspace bootstrap.
     - Added fatal cancellation propagation + structured warning context (`action`, `user_id`, `org_id`).
   - `apps/api/modules/system/plugins_manager/service.py`
     - Removed residual broad catches in enable-seed and plugin settings event publish envelopes.
     - Added fatal guard with contextual warning metadata.
   - `apps/api/modules/assets/service.py`
     - Removed broad S3 provider build catches in serve/download/thumbnail paths.
     - Extracted `_try_build_s3_provider(...)` recovery helper with fatal guard + structured logs.
   - `apps/api/bootstrap.py`
     - Removed silent broad catches in startup/shutdown best-effort hooks.
     - Added fatal guard + structured bootstrap warning logs.
   - `apps/api/settings/runtime.py`
     - Replaced broad runtime load/decrypt catches with typed envelopes and contextual warnings.
   - `apps/api/plugin/deps.py`
     - Removed broad plugin state catches in org/workspace dependency guards.
     - Added fail-closed typed envelopes with structured logs.
   - `apps/api/plugin/event_bus.py`
     - Replaced broad event handler/task catches with fatal-guarded envelopes.
2. Continued WP-3 long-tail typing cleanup:
   - `apps/web/admin/src/hooks/use-controlled-state.tsx`
     - Replaced `Rest extends any[]` with `Rest extends unknown[]` and removed explicit-any suppression.
3. Regenerated quality audit artifacts after this batch.

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check modules/auth/sso/service.py modules/sites/repository.py modules/system/service.py modules/system/plugins_manager/service.py bootstrap.py settings/runtime.py modules/assets/service.py plugin/deps.py plugin/event_bus.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm --filter @celestial/admin typecheck` => passed
- `pnpm audit:quality` => total findings `58` (`broad_exception` `42`, `large_file` `15`, `core_modules_dependency` `1`)

### Tracking updates

- `docs/plans/2026-02-08-self-host-quality-governance-master-plan.md`
  - latest baseline synced to `58` findings / `42` broad exceptions.
- `docs/audit/2026-02-08-issue-register.csv`
  - added governance tracking items for PublicUUID consistency and semantic activity event taxonomy.

### Next

1. Continue WP-4 tail on next dense files: `modules/organization/plugins/service.py`, `modules/shares/service.py`, `modules/sites/repository_publishing.py`, `modules/sites/portal_extensions/service.py`.
2. Execute WP-2 P0 decomposition lane: `apps/web/admin/src/pages/assets/page.tsx`, `apps/web/admin/src/components/common/assets/asset-masonry-card.tsx`, `apps/web/admin/src/pages/team/roles/page.tsx`.
3. Add enforceable quality guards for:
   - external-facing UUID uses PublicUUID consistently;
   - activity/event naming uses semantic taxonomy (ban generic `*.updated` style names).


## 2026-02-08 - WP-4 P0 Continuation (organization/shares/sites-publishing/admin-extensions)

### Completed

1. Continued WP-4 long-tail reduction on secondary-density backend lanes:
   - `apps/api/modules/organization/plugins/service.py`
     - Replaced broad org plugin-state persistence catches with typed envelopes (`OperationalError`, runtime/type errors).
   - `apps/api/modules/shares/service.py`
     - Removed broad S3 provider fallback catches via fatal-guarded provider construction and structured warnings.
     - Narrowed body close cleanup catch to typed IO/runtime errors.
   - `apps/api/modules/sites/repository_publishing.py`
     - Replaced broad deps parse catches with typed `ValueError` envelopes.
   - `apps/api/modules/sites/portal_extensions/service.py`
     - Replaced broad workspace-state/sync catches with typed + fatal-guarded envelopes and contextual logs.
   - `apps/api/modules/system/admin/extensions/service.py`
     - Replaced broad workspace-state/sync catches with typed + fatal-guarded envelopes and contextual logs.
2. Preserved fail-safe behavior and plugin compatibility semantics while removing `except Exception` handlers.
3. Regenerated quality audit artifacts.

### Verification

- `pnpm --filter @celestial/api exec uv run ruff check modules/organization/plugins/service.py modules/shares/service.py modules/sites/repository_publishing.py modules/sites/portal_extensions/service.py modules/system/admin/extensions/service.py modules/auth/sso/service.py modules/sites/repository.py modules/system/service.py modules/system/plugins_manager/service.py bootstrap.py settings/runtime.py modules/assets/service.py plugin/deps.py plugin/event_bus.py` => passed
- `pnpm --filter @celestial/api typecheck` => 0 errors
- `pnpm --filter @celestial/api test` => 190 passed / 42 skipped
- `pnpm audit:quality` => total findings `48` (`broad_exception` `32`, `large_file` `15`, `core_modules_dependency` `1`)

### Tracking updates

- `docs/plans/2026-02-08-self-host-quality-governance-master-plan.md`
  - baseline synced from `58/42` to `48/32`.
- `docs/audit/latest-quality-report.md`
  - regenerated at `2026-02-08 18:53:45 UTC`.

### Next

1. Continue WP-4 tail on core/common/plugin runtime files (`core/logging.py`, `core/middleware/locale.py`, `common/utils/public_ids.py`, `plugin/routes.py`, `plugin/watch.py`).
2. Start WP-2 P0 large-file拆分: `apps/web/admin/src/pages/assets/page.tsx` and `apps/web/admin/src/components/common/assets/asset-masonry-card.tsx`.
3. Land governance guardrails for PublicUUID outbound consistency and semantic activity event naming taxonomy.
