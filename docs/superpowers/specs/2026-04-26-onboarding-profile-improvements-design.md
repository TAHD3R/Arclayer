# Onboarding Profile Improvements Design

Date: 2026-04-26

## Scope

This design updates the welcome onboarding flow after the hard-cut route migration. The work covers:

- Step 1 profile form fields
- user-scoped onboarding profile persistence
- product update email subscription intent
- Step 4 questionnaire expansion
- admin i18n and focused frontend/backend validation

The current modal onboarding flow stays removed. The welcome route remains the canonical onboarding surface.

## Current Context

The welcome flow lives in `apps/admin/src/pages/onboarding/welcome/page.tsx`.

Step 1 currently uses `UserProfilePreferencesStep` and collects:

- avatar
- display name
- interface language
- time zone

The language and time zone controls are personal preference controls. The requested product behavior is to rely on existing defaults for those values during onboarding.

The backend already persists workspace-first onboarding state through `SettingRecord` with a user scope namespace in `apps/api/src/modules/auth/onboarding/service.py`. This is the right persistence pattern for onboarding profile data because these fields are product onboarding signals and can evolve as the questionnaire changes.

## Recommended Approach

Use a dedicated user-scoped onboarding profile setting record.

Add a new backend service around `SettingRecord` with this namespace:

```text
onboarding.profile
```

Store a JSON payload:

```json
{
  "job_role": "content_manager",
  "company_size": "11_50",
  "subscribed_product_updates": true,
  "heard_about_us": "search",
  "updated_at": "2026-04-26T00:00:00+00:00"
}
```

The Admin API type exposes this as camelCase:

```ts
type OnboardingProfile = {
  jobRole: string | null;
  companySize: string | null;
  subscribedProductUpdates: boolean;
  heardAboutUs: string | null;
};
```

This stores product research data in the onboarding setting record and keeps product update subscription intent separate from operational notification preferences.

## Step 1 UI

Update `UserProfilePreferencesStep`:

- Remove `Interface Language`.
- Remove `Time zone`.
- Add `Job role` select.
- Add `Company size` select.
- Add `Subscribe to product update emails` switch.

The new fields use the existing title + description setting row style from the removed language/time zone controls:

```tsx
<SettingDialogField title={...} description={...}>
  ...
</SettingDialogField>
```

For the switch row, keep the same title and description pattern, with the switch aligned inline at the trailing edge of the row. The row scans like a setting.

Step 1 required validation remains focused on display name. `Job role`, `Company size`, and product update subscription are optional profile signals. Continue remains disabled only when the display name is empty or invalid.

## Step 1 Copy And Options

Suggested English copy:

- Job role
  - Description: `Tell us what best describes your role so Arclayer can shape the first workspace around your daily work.`
- Company size
  - Description: `Choose the closest team size so collaboration defaults match the way your organization works.`
- Subscribe to product update emails
  - Description: `Get the latest updates about features and product updates. You can unsubscribe anytime in settings.`

Suggested Chinese copy:

- 职业角色
  - Description: `告诉我们最接近你日常工作的角色，Arclayer 会据此调整初始工作空间建议。`
- 公司规模
  - Description: `选择最接近的团队规模，让协作默认设置更贴合你的组织方式。`
- 订阅产品更新邮件
  - Description: `接收功能发布与产品更新邮件。你可以随时在设置中取消订阅。`

Job role options:

- Content manager
- Website manager
- Marketing lead
- Founder / business owner
- Developer / technical builder
- Product manager
- AI operations lead
- Agency / implementation partner
- Other

Company size options:

- Just me
- 2-10
- 11-50
- 51-200
- 201-1,000
- 1,001+

Values use stable enum-like strings:

```ts
content_manager
website_manager
marketing_lead
founder_owner
developer_builder
product_manager
ai_operations
agency_partner
other

solo
2_10
11_50
51_200
201_1000
1001_plus
```

## Product Update Subscription Persistence

Persist `subscribedProductUpdates` in the new onboarding profile setting record.

This value represents product/marketing update intent collected during onboarding. This rollout stores it in the onboarding profile record. Existing notification preferences remain event/topic/channel controls for operational product notifications.

The future product update email settings surface can read this onboarding profile field or a migrated marketing preferences record.

## Step 4 Questionnaire

Keep the accepted two-question stepped structure, then add a third substep:

1. Team type
2. Primary goal
3. How did you hear about us?

The current `questionnaireSubstep` becomes a three-step index: `0 | 1 | 2`.

Back behavior:

- From substep 2, back returns to primary goal.
- From substep 1, back returns to team type.
- From substep 0, back returns to Step 3.

Skip behavior:

- Keep the ghost skip button on the first questionnaire substep.
- On later substeps, the primary continue action advances or finishes without requiring a selection.

Suggested English question:

```text
How did you hear about us?
```

Suggested Chinese question:

```text
你是如何了解到我们的？
```

Suggested options:

- Search engine
- Social media
- Friend or colleague
- Community or event
- Article or newsletter
- AI tool directory
- Agency or consultant
- Other

Stable values:

```ts
search
social
referral
community_event
article_newsletter
ai_directory
agency_consultant
other
```

Step 4 final submit saves `heardAboutUs` into the same onboarding profile setting record before navigating to the product.

## Backend API

Add a small current-user endpoint group under auth:

```http
GET /auth/me/onboarding-profile
PATCH /auth/me/onboarding-profile
```

Request:

```json
{
  "job_role": "content_manager",
  "company_size": "11_50",
  "subscribed_product_updates": true,
  "heard_about_us": "search"
}
```

Response:

```json
{
  "job_role": "content_manager",
  "company_size": "11_50",
  "subscribed_product_updates": true,
  "heard_about_us": "search"
}
```

Validation rules:

- all fields optional in PATCH
- enum values limited to the known option sets
- `subscribed_product_updates` defaults to `false`
- unknown values return a validation error
- missing record returns default null/false values

The service preserves existing values when PATCH omits a field.

## Admin Data Flow

On welcome page load:

- fetch profile data as today
- fetch onboarding profile when not in dry-run mode
- seed Step 1 fields from onboarding profile defaults

On Step 1 Continue:

- validate display name
- update profile display name/avatar as today
- PATCH onboarding profile with `jobRole`, `companySize`, `subscribedProductUpdates`
- show the existing profile saved toast
- move to Step 2

On Step 4 final completion:

- PATCH onboarding profile with `heardAboutUs`
- keep existing onboarding completion checks
- navigate to the product

Dry-run mode:

- store selections in local component state only
- skip network calls
- continue to support `/welcome?dryRun=1`

## i18n

Add keys to both `locales/en-US/onboarding.json` and `locales/zh-CN/onboarding.json`.

Use onboarding namespace for all new welcome flow copy:

- field titles
- field descriptions
- select placeholders
- option labels
- questionnaire question
- questionnaire progress text

Components use i18n keys for all user-facing strings.

## Testing

Admin focused tests:

- Step 1 no longer renders language/time zone controls.
- Step 1 renders job role, company size, and product update switch.
- Job role and company size selections are passed to the Step 1 save call.
- Product update switch value is passed to the Step 1 save call.
- Fourth step includes the new `How did you hear about us?` substep.
- Back navigation works across three questionnaire substeps.
- Dry-run can advance through all questionnaire substeps without API calls.

API focused tests:

- default onboarding profile response when no record exists
- PATCH creates a user-scoped setting record
- PATCH preserves omitted fields
- invalid enum values fail validation
- product update subscription persists as a boolean

Static verification:

- `pnpm -C apps/admin typecheck`
- focused Admin onboarding tests
- focused API tests for the new service/router

## Acceptance Criteria

- Step 1 contains avatar, display name, job role, company size, and product update email subscription.
- Step 1 does not render interface language or time zone controls.
- Step 1 Continue saves this step's new data in the backend during real onboarding.
- The new backend record uses a user-scoped `SettingRecord` namespace.
- Product update email subscription is stored in the onboarding profile record.
- Step 4 keeps a stepped questionnaire flow and adds `How did you hear about us?`.
- All new copy is localized in English and Chinese.
- Dry-run remains available for development testing.
