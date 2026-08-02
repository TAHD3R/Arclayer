# Backend Notification Contracts

This code-spec defines canonical in-app notification source catalog, system policy gates, and producer requirements.

## Scenario: Catalog-Gated Notification Delivery

### 1. Scope / Trigger

- Trigger: adding or changing notification-producing backend code, notification event names, notification settings, or user notification preference topics.
- Applies to:
  - `apps/api/src/modules/system/admin/notifications/**`
  - direct notification producers under `apps/api/src/modules/**`
  - system core setting schema fields under `apps/api/src/settings/**`
  - event, lifecycle, automation, and hook integrations that may create in-app notifications.

### 2. Signatures

- System policy setting:
  - `notifications.groups.<group>.enabled`
  - Supported groups: `team`, `security`, `content`, `automation`, `system`.
- Canonical catalog:
  - `NotificationDefinition(event_name, group, category, title_i18n, description_i18n, target, in_app_supported=True)`
  - `NOTIFICATION_DEFINITIONS`
  - `get_notification_definition(event_name: str | None) -> NotificationDefinition | None`
- Policy gate:
  - `is_notification_group_enabled_for_event(*, settings: Settings, event_name: str | None) -> bool`
- Producer entrypoint:
  - `create_notification_record(*, settings: Settings, workspace_id: UUID, recipient_user_id: UUID, category: NotificationCategory, title: str, body: str | None, target: NotificationNavigationTarget, event_name: str | None, actor_user_id: UUID | None = None, dedupe_key: str | None = None, campaign_surface: NotificationCampaignSurface | None = None) -> NotificationRecordCreateResult`
  - `NotificationRecordCreateResult(disposition, record)` with exactly `created`, `group_suppressed`, `preference_suppressed`, or `deduplicated` dispositions.
- User preference gate:
  - `is_notification_channel_enabled_for_event(*, user_id: UUID, event_name: str | None, channel: Literal["in_app", "email"]) -> bool`

### 3. Contracts

- `notifications.groups` is the only canonical system-level in-app notification policy shape.
- `notifications.invite_enabled` is obsolete and must not be read, written, or preserved as a fallback.
- Group defaults are:
  - `team`: enabled
  - `security`: enabled
  - `content`: enabled
  - `automation`: enabled
  - `system`: disabled
- Notification producers must call `create_notification_record` unless they are intentionally creating dev/demo seed data.
- The delivery entrypoint must evaluate gates in this order:
  - catalog group policy
  - user channel preference
  - `NotificationRecord.create(...)` with dedupe handling.
- Every persisted navigation target is one `NotificationNavigationTarget` discriminated object. Route strings and untyped routing metadata are not runtime contracts.
- `system.broadcast` is the only event that may carry a `NotificationCampaignSurface`; all other events reject one. A broadcast must carry its immutable Campaign surface.
- Unknown event names remain deliverable by default so existing non-cataloged producers keep surfacing until they are cataloged. New product notification producers must add a catalog definition in the same change.
- Event/lifecycle/automation sources may be cataloged before automatic production exists. Automatic production is allowed only when recipient, message, typed target, and dedupe semantics are explicit.
- Automation notification actions use `event_name="automation.notification"` for system policy grouping and persist a validated typed target in their operation config.
- System events such as `system.mail.updated`, `system.storage.updated`, and `system.settings.feature_flags.updated` are cataloged but must not auto-create inbox notifications until recipient rules are explicit.
- Personal notification preferences remain user-scoped under `notifications.me.preferences`; system settings must not expose or mutate them.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Producer uses `NotificationRecord.create(...)` directly | Replace with `create_notification_record(...)`, except for explicit dev/demo seed paths |
| Producer reads `notifications.invite_enabled` | Remove the read; map the event to the `team` group catalog entry |
| `notifications.groups.<group>.enabled` is `false` | Return `NotificationRecordCreateResult(group_suppressed, None)` before evaluating user preferences or writing a record |
| User preference disables the in-app channel | Return `NotificationRecordCreateResult(preference_suppressed, None)` without writing a record |
| Duplicate `dedupe_key` violates the unique constraint | Return `NotificationRecordCreateResult(deduplicated, None)` from `create_notification_record` |
| Record write succeeds | Return `NotificationRecordCreateResult(created, record)` |
| Cataloged event has no explicit recipient resolver | Keep it cataloged but do not add automatic production |
| Automation notification action is suppressed or deduplicated | Return an explicit operation result with `delivered: false` and no record id |

### 5. Good/Base/Bad Cases

- Good: workspace invite acceptance calls `create_notification_record(..., target=NotificationWorkspaceSettingsTarget(destination="people", section="members-table"), event_name="workspace.invitation.accepted")`; the catalog maps it to the `team` group.
- Good: scheduled publish job result calls `create_notification_record(..., target=NotificationProjectTarget(...), event_name="project.release.scheduled_publish.completed")`; the catalog maps it to `content`.
- Good: an automation notification action stores `target={"kind": "inbox"}` in its operation configuration and uses `automation.notification` as the notification policy event.
- Base: `system.mail.updated` is present in `NOTIFICATION_DEFINITIONS` with group `system`, but no subscriber creates notification rows until recipient rules exist.
- Bad: a service reads system settings directly, checks `invite_enabled`, and then hand-writes `NotificationRecord.create(...)`.
- Bad: a lifecycle subscriber creates notifications for every content update without an explicit recipient resolver.

### 6. Tests Required

- Unit tests must assert:
  - core schema exposes `notifications.groups` and not `notifications.invite_enabled`
  - catalog includes the first-slice event sources
  - group defaults are applied when a group entry is missing
  - disabled group policy returns the explicit `group_suppressed` disposition before user preferences are evaluated
  - enabled group plus enabled user preference writes a record through the shared entrypoint
- Producer tests must assert:
  - event names passed to `create_notification_record` match catalog keys
  - disabled notification policy and personal preference produce explicit no-delivery dispositions where the producer has a public result contract
  - dedupe behavior does not create duplicate rows.
- Integration tests are required when a route/job/automation flow changes externally visible behavior.

### 7. Wrong vs Correct

#### Wrong

```python
core = await get_core_settings_value_cached(settings)
if core.get("notifications", {}).get("invite_enabled", True):
    await NotificationRecord.create(
        workspace_id=workspace_id,
        recipient_user_id=recipient_user_id,
        category=NotificationCategory.TEAM,
        title=title,
        event_name="workspace.invitation.accepted",
    )
```

#### Correct

```python
await create_notification_record(
    settings=self.settings,
    workspace_id=workspace_id,
    recipient_user_id=recipient_user_id,
    category=NotificationCategory.TEAM,
    title=title,
    body=body,
    target=NotificationWorkspaceSettingsTarget(destination="people", section="members-table"),
    event_name="workspace.invitation.accepted",
    dedupe_key=f"workspace.invitation.accepted:{code}",
)
```

System policy, user preferences, typed-target validation, Campaign-surface validation, and dedupe behavior stay inside one notification delivery entrypoint.
