# Storage / Upload / Asset Library Plan

Applies to: CelestialCMS (`apps/api` FastAPI + plugin system + `apps/web/admin`)

This document defines an implementation plan for:

- Resumable uploads (chunked, retryable, idempotent completion)
- Asset storage abstraction (Local first, S3-compatible later for SaaS)
- Public asset delivery (anonymous access) with HTTP Range support for large videos
- Asset library (folders + waterfall listing + tags) and external sharing
- Variants (thumbnails / previews / video posters) as an async pipeline

## Current Status (as of 2026-01-29)

Backend delivery status (focus on server-side, per our latest agreement):

- Local provider: resumable upload + Range delivery: DONE
- Public assets:
  - `/assets/{asset_id}` -> 301 canonical: DONE
  - `/assets/{asset_id}/{slug}.{ext}` with Range: DONE
  - `/assets/{asset_id}/download` attachment: DONE
  - `/assets/{asset_id}/thumb` thumbnails (fallback): DONE
- Share link:
  - `/s/{token}` preview (Range): DONE
  - `/s/{token}/download`: DONE
  - Admin create/revoke with expiration: DONE
- S3 provider (S3-compatible OSS):
  - Multipart direct upload (presign + commit + complete): DONE
  - CDN/public base URL redirect: DONE (fallback to presigned GET if no CDN configured)
  - Note: `expected_sha256` validation is NOT supported for S3 multipart in phase 1.
- Plugin integration:
  - Storage provider factories via extension point: DONE (core local + core s3)
  - Post-upload processors via in-process event bus: DONE
  - Core thumbnail processor:
    - local thumbnails: DONE
    - s3 thumbnails: DONE (best-effort; uploads thumb objects back to S3)
- Multi-worker correctness:
  - `complete` single-winner CAS: DONE
  - stale COMPLETING takeover (avoid stuck sessions): DONE
  - asset create idempotency (reserved asset_id): DONE
- Recycle bin / retention: NOT in scope now (no scheduler framework yet); do not implement yet.

## 1) Confirmed Requirements (Decisions)

- Deployment now: single machine, multi-worker (granian/gunicorn).
- Future: migrate to SaaS (multi-tenant), so storage must be provider-based from day 1.
- File types: common images, zip, PDF, videos, fonts.
- Must support:
  - Public access for avatars / site logo / favicon.
  - Video playback with seeking and large files -> **HTTP Range required**.
  - Content references store `asset_id` (not raw URLs) and resolve URLs at render time.
  - Asset immutability: when an article cover is replaced, the old `asset_id` remains valid.
- External access models (both):
  - Public Library: truly public and indexable.
  - Share link: access via share URL; share supports configurable expiration time.
- Multi-tenant consideration: Public Library must be bound to an organization.
- UX/perf: thumbnails/previews are required for waterfall views.
- Organization: "categories" should not be a separate system; use tags (optionally grouped) to cover category-like needs.

## 2) Goals / Non-goals

### Goals (MVP)

- Local provider + resumable uploads with:
  - init / status (missing parts) / upload part / complete / abort
  - retries and idempotency
- Public asset delivery:
  - canonical URLs
  - correct caching headers
  - Range support (206 / 416) without loading entire files into memory
- Admin asset library:
  - folders (tree)
  - waterfall listing (cursor pagination)
  - tags and filtering
- Plugin integration points:
  - storage providers
  - post-upload processors (variants)

### Non-goals (Phase 1)

- Video transcoding / HLS / DASH
- Full-text search / vector search
- Complex permission matrices beyond: public / share / admin-managed
- Recycle bin / scheduled retention tasks

## 3) Architecture Overview

### 3.1 Asset immutability

Assets are treated as immutable blobs:

- Upload creates a new Asset record.
- Replacing avatars / covers / logos creates a new Asset and updates the reference.
- Old asset URLs continue to work until retention policy deletes them (at least 90 days after becoming unreferenced).

### 3.2 URL strategy (no raw filenames)

Do not expose user-provided filenames in public URLs (privacy + consistency).

- Canonical public URL:
  - `GET /assets/{asset_id}/{slug}.{ext}`
  - `asset_id` identifies the object
  - `slug` is a controlled display name (user title or sanitized generated string)
- Redirect:
  - `GET /assets/{asset_id}` -> 301 to canonical
- Download endpoint:
  - `GET /assets/{asset_id}/download` returns `Content-Disposition: attachment` with `original_filename`.

### 3.3 Public Library vs Share Link

- Public Library (indexable):
  - URL: `GET /o/{org_slug}/library`
  - Should be crawlable (indexable).
- Share Link:
  - URL: `GET /s/{token}`
  - Has `expires_at` (optional) and is not enumerable.
  - Must support "link access" + expiration.

### 3.4 Storage provider abstraction

Define a `StorageProvider` protocol and implement:

- LocalProvider (phase 1)
  - root directory and tmp directory
  - atomic moves (`rename`) on completion
  - safe path mapping (no path traversal)
- S3Provider (phase 4 -> pulled forward for SaaS readiness)
  - presigned multipart upload (client direct upload)
  - optional CDN base URL (public_base_url)

### 3.5 Multi-worker correctness

Upload completion must be idempotent and single-winner:

- UploadSession has a state machine stored in DB.
- `complete` must succeed at most once (atomic DB update / lock).
- Duplicate `PUT part` is allowed; must be consistent (overwrite or verify checksum).

## 4) Data Model (Proposed Tables)

### 4.1 assets

Key fields:

- `id` (UUID)
- `org_id`, `owner_user_id` (optional per purpose)
- `folder_id` (nullable)
- `purpose` (avatar, site_logo, favicon, library, attachment, article_cover, ...)
- `visibility` (public / private / shared)
- `indexable` (bool)
- `title` (optional)
- `slug` (controlled)
- `original_filename` (internal)
- `mime`, `ext`, `size_bytes`
- `checksum_sha256`
- `storage_provider`, `object_key`
- `variants` (JSON: thumb/preview/poster object_keys + dims)
- `meta` (JSON: width/height/duration/etc)
- `deleted_at` (soft delete)
- `created_at`, `updated_at`

### 4.2 asset_folders

- `id`, `org_id`, `parent_id`, `name`, `created_at`

### 4.3 tags

- `asset_tags`: `id, org_id, name, group(optional), color(optional)`
- `asset_tag_links`: `(asset_id, tag_id)` unique

Use `group="category"` to implement "categories" without a second parallel system.

### 4.4 uploads

- `upload_sessions`:
  - `id`, `org_id`, `actor_user_id`
  - `purpose`, `filename`, `mime`, `size_bytes`, `expected_sha256`
  - `chunk_size`, `total_parts`
  - `status`, `expires_at`
  - `target_folder_id`, `storage_provider`
- `upload_parts`:
  - `session_id`, `part_number`, `size_bytes`
  - `checksum(optional)`, `stored`, `tmp_object_key/tmp_path`

### 4.5 shares / public libraries

- `asset_shares`:
  - `id` (random, non-enumerable)
  - `org_id`
  - `root_folder_id`
  - `expires_at` (nullable)
  - `created_by`, `created_at`
- `public_libraries`:
  - `id`
  - `org_id`
  - `org_slug` (or resolve through org table)
  - `library_slug`
  - `root_folder_id`
  - unique constraint: `(org_id, library_slug)`

## 5) API Surface (Routing Plan)

### 5.1 Admin: uploads

- `POST /api/v1/admin/uploads/init`
- `GET /api/v1/admin/uploads/{upload_id}`
- `PUT /api/v1/admin/uploads/{upload_id}/parts/{part_number}`
- `POST /api/v1/admin/uploads/{upload_id}/parts/{part_number}/presign` (S3 only)
- `POST /api/v1/admin/uploads/{upload_id}/parts/{part_number}/commit` (S3 only)
- `POST /api/v1/admin/uploads/{upload_id}/complete`
- `POST /api/v1/admin/uploads/{upload_id}/abort`

### 5.2 Admin: asset library

- `GET /api/v1/admin/assets` (cursor pagination; folder/type/tag filters)
- `POST /api/v1/admin/assets/folders`
- `GET /api/v1/admin/assets/folders/tree`
- `PATCH /api/v1/admin/assets/{asset_id}` (title/slug/tags/move)
- `DELETE /api/v1/admin/assets/{asset_id}` (soft delete -> recycle bin)
- `POST /api/v1/admin/assets/{asset_id}/restore`

### 5.3 Public: assets (non-versioned)

Mount on the FastAPI app directly (outside `/api/v1`):

- `GET /assets/{asset_id}` -> 301 canonical
- `GET /assets/{asset_id}/{slug}.{ext}` (supports Range)
- `GET /assets/{asset_id}/download` (attachment)

### 5.4 Public Library (indexable)

- `GET /o/{org_slug}/library` (HTML indexable or JSON)

### 5.5 Share Link

- `POST /api/v1/admin/assets/{asset_id}/share-links` (create; includes expires_in_seconds)
- `POST /api/v1/admin/share-links/{link_id}/revoke`
- `GET /s/{token}` (preview)
- `GET /s/{token}/download`

## 6) Variants Pipeline (Thumbnails / Preview / Poster)

- Variants are produced asynchronously after upload completion.
- Trigger: publish `ASSET_UPLOADED` event with minimal payload.
- Processor(s) write variants back to the same storage provider and update `assets.variants/meta`.

Phase 1: define the contracts + storage layout + DB fields.
Phase 3: implement image thumbnails and video poster extraction (plugin-friendly).

## 7) Settings (core settings schema extension)

Add to `core` settings:

- `storage.provider`: `local | s3`
- `storage.public_base_url`: used to build public URLs
- `local.root_dir`, `local.tmp_dir`
- `s3.endpoint`, `s3.bucket`, `s3.region`, `s3.access_key`, `s3.secret_key` (secrets encrypted)
- `upload.max_file_size_mb`
- `upload.chunk_size_mb`
- `upload.allowed_mime` (whitelist)
- `assets.variants.enabled`
- (Deferred) recycle bin retention settings; not implemented without a scheduler.

## 8) Security / Risk Controls

- Validate content types:
  - allowlist by mime/ext
  - optional magic-byte checks later (recommended)
- Prevent path traversal in LocalProvider (sanitize object_key).
- Ensure Range implementation is correct and streaming (no full-file read into memory).
- Share IDs must be non-enumerable; expiration must be enforced.

## 9) Plugin Integration

Extension points:

- `storage.providers` (multi-instance)
- `asset.processors` (multi-instance)

Events:

- `ASSET_UPLOADED`
- `ASSET_DELETED`

## 10) Milestones

### Phase 0: Spec + scaffolding

- finalize models + routes
- update core settings schema
- define provider + processor contracts

### Phase 1: LocalProvider + resumable upload + public Range delivery (MVP)

- implement upload sessions and chunk storage
- implement `GET /assets/...` with Range
- implement basic asset creation

Acceptance:

- large video supports seeking
- upload resumes after interruption
- cover replacement does not break old asset links

### Phase 2: Admin asset library + Public Library + Share link

- folders, tags, listing pagination
- public library binding to org
- share creation with expiration

### Phase 3: Variants

- thumbnails for images
- poster + duration for video (plugin-friendly)

### Phase 4: S3Provider (SaaS readiness)

- presigned multipart upload
- CDN base URL and direct delivery

## 11) Test Strategy

- Unit tests:
  - Range parsing and response headers
  - object_key sanitization
  - upload session state machine (idempotent complete)
- Integration tests (optional, `RUN_INTEGRATION_TESTS=1`):
  - upload -> complete -> range download -> checksum match
  - share expiration enforcement
