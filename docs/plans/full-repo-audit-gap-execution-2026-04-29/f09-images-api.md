# F09: Images API

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: 图像转换 API
> Matrix category: completely missing
> Source audit anchors: sections 7.1, 7.2, 14, 15.
> Default batch: 5
> Coupling: medium

## Objective

Add a URL-driven image transformation API for assets, supporting dimensions, fit, format, quality, cache keys, and explicit delivery behavior.

## Context

- Arclayer supports uploads, providers, thumbnails, video preview, PDF preview, usage tracking, and trash.
- The audit records missing Contentful-style URL parameters such as `w`, `h`, `fit`, `fm`, and `q`.
- Existing image processing uses Pillow for thumbnails.

## Scope

- Define image transformation query parameters and validation.
- Implement transformation service for supported formats.
- Add cache-key derivation and storage for transformed outputs.
- Serve transformed outputs through the selected asset delivery path.
- Enforce project/site/asset access rules.
- Document supported parameters and limits.

## Exclusions

- CDN provider integration unless a backing delivery path already exists.
- AI metadata generation.
- Asset upload provider changes.

## Dependencies

- Benefits from `f01-content-delivery-api.md`.
- May require route boundary decisions from `d01-api-architecture-separation.md`.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `docs/guidelines/backend-endpoint-contract.md`
- Existing asset storage and delivery code.
- Source audit section 7.

## Execution Instructions

1. Inspect asset storage providers, thumbnails, and delivery endpoints.
2. Define parameter schema:
   - width and height
   - fit mode
   - format
   - quality
   - focal point or crop flags only if live model supports them
3. Implement strict parameter validation.
4. Derive deterministic cache keys from source asset version and transform parameters.
5. Add transformation service and output storage.
6. Add tests for transformations, invalid parameters, cache hits, and permissions.
7. Document supported behavior.

## Acceptance Criteria

- Image assets can be requested with supported transform parameters.
- Invalid transforms fail with explicit typed errors.
- Repeated requests use cached transformed output.
- Access control matches asset delivery rules.

## Verification

- Run focused asset/image API tests.
- Run `pnpm api:check`.
- Run GitNexus `impact` on asset delivery symbols before editing, then `detect_changes`.

## Execution Log

- Status: verified
- Last updated: 2026-05-01
- Files changed:
  - `apps/api/src/platform/assets/images.py`
  - `apps/api/src/modules/assets/service.py`
  - `apps/api/src/modules/assets/router.py`
  - `apps/api/src/modules/assets/admin/assets/service.py`
  - `apps/api/src/modules/projects/assets/assets_router.py`
  - `apps/api/tests/platform/assets/test_image_transforms_unit.py`
  - `apps/api/tests/modules/assets/test_assets_service_unit.py`
  - `apps/api/tests/modules/projects/test_project_assets_contract_unit.py`
  - `apps/api/tests/modules/projects/test_project_assets_integration.py`
  - `docs/guidelines/images-api.md`
  - `docs/guidelines/README.md`
  - `locales/en-US/errors.json`
  - `locales/zh-CN/errors.json`
- Tests run:
  - `pnpm -C apps/api lint`
  - `pnpm -C apps/api typecheck`
  - `pnpm -C apps/api uv -- pytest -q tests/platform/assets/test_image_transforms_unit.py tests/modules/assets/test_assets_service_unit.py::test_public_asset_serve_applies_local_image_transform tests/modules/projects/test_project_assets_contract_unit.py --no-cov`
  - `RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_assets_integration.py::test_project_image_transform_content_endpoint_uses_cached_output --no-cov`
  - `pnpm api:check` (619 passed, 197 skipped)
- GitNexus:
  - `impact` on `stream_asset_content` in `apps/api/src/modules/projects/assets/assets_router.py`: LOW risk, no upstream callers or affected processes.
  - `impact` on `AdminAssetsService.stream_asset_content`: LOW risk, no upstream callers or affected processes.
  - `impact` on `AssetsService.serve`: LOW risk, direct caller `asset_serve`.
  - `impact` on `AssetsService.thumbnail`: LOW risk, direct caller `asset_thumbnail` plus existing thumbnail unit test.
  - `detect_changes(scope="all")`: low risk, changed files concentrated in asset transform routes/services/tests/docs, no affected processes.
- Notes: Implemented `w`, `h`, `fit`, `fm`, and `q` transforms for local-storage image assets. Public `/assets/{asset_id}/{filename}` keeps public asset visibility checks; project `/api/v1/projects/{project_id}/assets/{asset_id}/content` keeps `project:assets:read`. Transform cache keys derive from source object key, source version, and normalized params, and repeated requests return `X-Image-Transform-Cache: hit`. Remote object storage continues on original delivery paths because server-side transforms require local file access in this rollout.
