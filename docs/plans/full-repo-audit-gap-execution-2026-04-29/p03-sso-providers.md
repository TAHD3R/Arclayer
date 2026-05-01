# P03: SSO Providers

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: SSO 提供商
> Matrix category: partial implementation
> Source audit anchors: sections 4.1 and 14.
> Default batch: 5
> Coupling: low

## Objective

Expand SSO provider support beyond GitHub and Google using the existing authentication architecture.

## Context

- Existing OAuth providers are GitHub and Google.
- The audit identifies missing providers such as Facebook, Discord, and Microsoft.
- SSO is a partial capability, not a platform blocker.

## Scope

- Add provider abstraction only where existing auth code needs one.
- Add prioritized providers based on product need, with Microsoft and Discord as likely first candidates for work/team contexts.
- Add provider configuration validation.
- Add backend callback tests and Admin auth UI entries.
- Add localized provider labels where visible.

## Exclusions

- Enterprise SAML unless requested in a dedicated task.
- Role mapping from identity provider claims.
- SCIM provisioning.

## Dependencies

- Can proceed independently.
- Must coordinate with auth UI and security specs.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `.trellis/spec/admin/frontend/index.md`
- `docs/guidelines/i18n.md`
- Existing auth provider implementation.

## Execution Instructions

1. Inspect existing GitHub and Google provider code paths.
2. Identify the minimum reusable provider interface.
3. Add one provider at a time with tests.
4. Keep provider configuration explicit through settings.
5. Add UI provider buttons only when backend configuration exists.
6. Add callback, account-linking, and failure tests.

## Acceptance Criteria

- Each added provider has explicit settings, callback handling, and tests.
- Missing or invalid provider configuration fails visibly.
- Login UI displays only configured providers.
- Provider-specific failures return clear errors.

## Verification

- Run focused auth provider tests.
- Run focused Admin auth UI tests when UI changes.
- Run `pnpm api:check` and `pnpm admin:check` as needed.
- Run GitNexus `detect_changes` before commit.

## Execution Log

- Status: blocked
- Last updated: 2026-05-01
- Files changed:
  - `apps/api/src/modules/auth/oauth/social/providers.py`
  - `apps/api/src/modules/auth/oauth/social/schema.py`
  - `apps/api/src/modules/auth/oauth/social/service.py`
  - `apps/api/src/modules/auth/sso/service.py`
  - `apps/api/src/settings/core_schema.py`
  - `apps/api/tests/modules/auth/test_auth_sso_providers_empty_unit.py`
  - `apps/api/tests/modules/auth/test_oauth_social_register_gate_unit.py`
  - `apps/admin/src/lib/auth/oauth-provider-meta.tsx`
  - `apps/admin/src/components/ui/oauth-buttons.tsx`
  - `apps/admin/src/pages/system/oauth/page.tsx`
  - `apps/admin/src/pages/usercenter/profile/components/profile-linked-accounts-section.tsx`
  - `apps/admin/src/types/api/auth-sso.ts`
  - `apps/admin/test/components/ui/oauth-buttons.test.tsx`
  - `apps/admin/test/pages/me/profile-linked-accounts-section.test.tsx`
  - `locales/en-US/auth.json`
  - `locales/en-US/settings.json`
  - `locales/zh-CN/auth.json`
  - `locales/zh-CN/settings.json`
  - `docs/plans/full-repo-audit-gap-execution-2026-04-29/README.md`
  - `docs/plans/full-repo-audit-gap-execution-2026-04-29/p03-sso-providers.md`
- Notes:
  - Added a shared built-in OAuth provider definition table for Google, GitHub, Microsoft, and Discord.
  - Microsoft and Discord now have explicit core settings sections, provider-list entries, start URLs, callback token exchange, userinfo parsing, and account creation/linking coverage through the existing SSO flow.
  - Admin OAuth settings now render provider configuration from a provider list, and login/profile linked-account surfaces share localized provider metadata.
  - Login UI continues to render only providers returned by `/auth/sso/providers`, which requires enabled provider config with both client ID and client secret.
- Verification:
  - GitNexus impact analysis: `OAuthSocialService` MEDIUM, `AuthSSOService` MEDIUM, `build_core_settings_schema` MEDIUM, Admin OAuth surfaces LOW.
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/auth/test_auth_sso_providers_empty_unit.py tests/modules/auth/test_oauth_social_register_gate_unit.py` passed: 9 passed.
  - `pnpm -C apps/api uv -- ty check src/modules/auth/oauth/social src/modules/auth/sso src/settings/core_schema.py` passed.
  - `pnpm -C apps/admin exec oxlint -c ./node_modules/@arclayer/config/.oxlintrc.json src/components/ui/oauth-buttons.tsx src/pages/usercenter/profile/components/profile-linked-accounts-section.tsx src/pages/system/oauth/page.tsx src/lib/auth/oauth-provider-meta.tsx test/components/ui/oauth-buttons.test.tsx test/pages/me/profile-linked-accounts-section.test.tsx` passed.
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/ui/oauth-buttons.test.tsx test/pages/me/profile-linked-accounts-section.test.tsx` passed: 20 passed.
  - `pnpm api:check` passed: lint, format, typecheck, and test completed with 626 passed, 197 skipped.
  - `pnpm admin:check` partially passed: lint, format, and test passed with 955 passed; typecheck failed in existing `apps/admin/src/pages/workspaces/team/roles/components/team-roles-view.tsx` because `PermissionConditionSetOutput.conditions` is optional while `RolePermissionGrant.conditionSets[].conditions` is required.
