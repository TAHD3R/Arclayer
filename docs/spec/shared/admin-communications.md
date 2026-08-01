# Platform Communications Contract

Status: Approved domain contract; experience amended 2026-08-01
Parent: [Platform Control Plane Productization Rollout](./admin-control-plane-rollout.md)
Experience authority: [Product and Platform administration experience redesign](./product-admin-experience-redesign.md)
Supporting contracts: [Feedback and Support](./admin-feedback-support.md), [Notification and Mail capability details](./admin-plugin-notification-mail.md)

## 1. Scope

This contract defines one Communications Platform Domain for User feedback triage and replies, recipient sending issues, announcements and Campaigns, localized message templates, email-service readiness, and durable delivery evidence.

“Communications” is the canonical architecture term. The product label is `消息与反馈 / Messages & Feedback`; primary navigation describes feedback and sending work rather than internal notification, event, or transport models.

## 2. Current-state evidence

- `/system/feedback` is an operator work queue with assignment, priority, status, replies, internal notes, audit, and user-visible delivery failure.
- `/system/settings/notifications` mixes notification-group switches with Campaign authoring in a generic settings page.
- `/system/settings/email` combines mail enablement, Provider selection and configuration, sender identity, fallback and retry policy, test delivery, and locale-specific templates in another settings page.
- Campaign and transactional notifications require one durable per-recipient/channel delivery ledger, while the current event runtime still has a direct email path and the existing delivery record is Campaign-shaped.

## 3. Information architecture

Messages & feedback opens the **User feedback** queue by default and contains these peer operational surfaces:

1. **User feedback**: unassigned, unresolved, overdue, replied, and delivery-failed feedback with reporter context, assignment, priority, internal notes, public reply, and audit history.
2. **Sending issues**: retryable or terminal feedback-reply, transactional, Campaign, inbox, modal, banner, toast, and email deliveries with source, recipient/channel scope, attempts, safe failure reason, and authorized retry.
3. **Announcements & campaigns**: draft, preview, audience estimate, schedule, publish, cancellation, delivery progress, and recipient interactions for operator-authored messages.
4. **Message templates**: localized, versioned templates and channel variants with preview, required-variable validation, protected defaults, and restore history.
5. **Email service**: installed providers, active channel, sender identity, safe credential rotation, readiness and connection tests, retry/fallback policy, and affected deliveries.

The domain has no send-volume or engagement-card Overview. Recipient/channel rules and configuration remain beside the source or channel they govern instead of returning to a global Notifications settings page.

## 4. Authority boundaries

- Communications owns feedback triage and public replies. Feedback reporters retain access only to their own authorized tickets and public messages; internal notes never enter user APIs or delivery payloads.
- Operator-authored Campaigns own their content, audience definition, schedule, and lifecycle. They cannot impersonate a transactional event or select recipients reserved to another domain authority.
- A source Platform Domain owns the existence, meaning, entity scope, milestone, and recipient-resolution contract of a transactional notice. Communications owns template resolution, localization, channel dispatch, retries, delivery evidence, and recipient interaction.
- Delivery success, failure, retry, read, click, or dismissal never creates, delays, reverses, or fabricates the source-domain transition.
- Extensibility owns Plugin/Connector installation, upgrade, trust, permission review, rollback, and uninstall. Communications owns messaging-specific configuration and use of an installed channel capability.
- Monitoring & Audit owns historical delivery, engagement, volume, and latency analysis. Messages & feedback owns current work, readiness, recipient evidence, and retry actions.
- Workspaces may deep-link from a User or Workspace to authorized feedback or delivery records but does not duplicate reply, Campaign, or retry forms.

## 5. Shared delivery authority

Feedback replies, Campaign variants, and transactional dispatches retain distinct immutable source identities while using one `NotificationDelivery` authority per source, recipient, and channel. Source replay, worker retry, Provider webhook replay, and operator retry return or update the same delivery identity rather than producing another message.

An operator may retry only a delivery classified as retryable. Retry reuses the committed source content, audience decision, template version, and recipient/channel identity. It cannot edit the audience, substitute a template, synthesize a source event, mark success manually, or replay Commerce, Hosting, Identity, AI, or another domain transition.

## 6. Product copy and i18n

Every visible string uses stable i18n keys with equivalent `zh-CN` and `en-US` resources. Primary copy explains the recipient or operator effect:

- use “用户反馈 / User feedback,” not “feedback aggregate queue”;
- use “消息发送失败 / Message could not be sent,” followed by affected channel and retry guidance, not a transport enum as the title;
- use “公告与活动 / Announcements & campaigns,” not “global notification fan-out”;
- use “邮件服务尚未就绪 / Email service is not ready,” not a Provider configuration exception as primary copy.

Template keys, event names, delivery ids, Provider message ids, SMTP responses, recipient-resolution evidence, and raw errors appear only in authorized diagnostics. A send confirmation states audience, channels, schedule, irreversible effects, and whether the operation creates a draft, schedules work, or begins delivery.

## 7. Operational behavior

- Feedback, Campaign, transactional source, delivery, attempt, and recipient interaction states are persisted separately and never inferred from a toast or closed request.
- Partial delivery remains partial: successful recipients stay successful, failed recipients remain visible and retryable, and one global success message is forbidden.
- Email readiness distinguishes installed, configured, sender-verified, reachable, active, degraded, and unavailable instead of one enabled switch.
- Persistent critical delivery failure may project an Operational Signal with sanitized source and recipient scope; the resolution action remains retry or channel repair, never source-domain mutation.
- Public replies and outbound messages are sanitized and rendered through versioned templates; internal notes, secrets, raw request bodies, and unrestricted HTML never cross the recipient boundary.

## 8. Non-goals

- A marketing automation or arbitrary workflow scripting product.
- A Plugin catalog, installation, upgrade, rollback, or uninstall surface.
- A delivery or engagement Dashboard that duplicates Monitoring & Audit.
- Treating every unread message or ordinary pending send as an incident.
- Editing or replaying another domain's state from a delivery failure.

## 9. Migration contract

The hard cut moves `/system/feedback`, `/system/settings/notifications`, and `/system/settings/email` into the exact `/messages/**` routes defined by the administration experience redesign and removes their old navigation, `/communications/**` routes, settings registry entries, search items, wrappers, forms, and aliases. Direct event-runtime email delivery is removed after feedback replies, Campaigns, and transactional sources use the shared delivery authority. Existing records are migrated or projected with explicit source identity and status; missing source or delivery evidence remains visibly incomplete rather than being marked sent.
