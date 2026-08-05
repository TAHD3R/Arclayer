# Platform Extensibility Contract

Status: Approved domain contract
Parent: [Platform Control Plane Productization Rollout](./admin-control-plane-rollout.md)
Experience authority: [Product and Platform administration experience redesign](./product-admin-experience-redesign.md)
Supporting contract: [Plugin lifecycle capability details](./admin-plugin-notification-mail.md#4-plugin-domain-model)

## 1. Scope

This contract defines one Extensibility Platform Domain for instance Extension discovery, installation, integrity and trust, compatibility, requested-permission review, dependency impact, upgrade, rollback, disablement, removal, and provided connection-capability inventory.

“Extensibility” is the canonical architecture term. The product label is `扩展 / Extensions`; primary navigation describes installed software and lifecycle work rather than runtime registries or manifest structure.

## 3. Information architecture

Extensions opens **Installed** by default and contains these peer operational surfaces:

1. **Installed**: installed Extensions with current/available version, trust and compatibility, provided capabilities, current consumers, update or failure state, and state-aware actions.
2. **Extension catalog**: approved available Extensions with source, publisher/provenance, compatibility, requested permissions, provided capabilities, release notes, and install readiness.
3. **Connections**: installed Connector capabilities and shared connection identities grouped by the operator task they support. Extensibility owns authorize, re-authorize, disable, dependency-safe removal, trust, and shared readiness; the consuming Platform Domain owns business configuration and operational use reached through an exact link.
4. **Install & update history**: durable install, upgrade, enable, disable, rollback, and removal operations with phase, progress, safe logs, retryability, terminal result, actor, and audit correlation.

The domain has no card-based Overview. Installed is a searchable operational list, not a decorative marketplace grid; Extension cards may remain only where visual identity materially helps catalog discovery.

## 4. Authority boundaries

- Extensibility owns Extension package source, checksum/signature and provenance, manifest validation, compatibility, requested Platform Permissions, dependency graph, installed version, and lifecycle operation.
- The consuming Platform Domain owns capability-specific configuration and operational use: Access & Security owns identity-provider sign-in, AI Services owns AI model/provider use, Hosting & Domains owns storage/delivery use, and Messages & Feedback owns email-channel use.
- Extensibility owns shared connection identity, trust, authorization/re-authorization, disablement, and dependency-safe removal. It may show consuming-domain configuration readiness and an exact typed deep link but cannot render, proxy, or mutate the consuming domain's business form.
- Installing an Extension does not enable its capabilities, grant newly requested permissions, select it as a Provider, or expose navigation automatically. The Platform Capability Catalog changes only after trusted registration and the owning enablement contract succeed.
- Instance installation never activates an Extension for every Workspace. Workspace activate/deactivate requires a separately approved Product Application authority and increments its own Workspace Extension revision; absence of that contract leaves Workspace activation unavailable.
- Workspace-authored Knowledge, Skills, Design Systems, and Agents are not Extension packages and do not enter this domain.

## 5. Trust and lifecycle behavior

- Catalog and manually supplied package metadata are untrusted until source policy, checksum/signature or provenance, manifest schema, compatibility, capability registration, and permission review pass.
- Install, upgrade, disable, rollback, and removal are durable idempotent operations; an accepted request is not completion, and runtime activation must be verified before success.
- Permission increases, capability changes, new data egress, dependency changes, irreversible migrations, and loss of rollback require explicit preview and confirmation.
- Disable or removal fails with exact consumers and dependency conflicts when safe detachment is not complete; it never leaves partial hidden activation.
- Failed operations retain their completed phase, current runtime state, safe diagnostics, retry/rollback eligibility, and audit evidence.

## 6. Product copy and i18n

Every visible string uses stable i18n keys with equivalent `zh-CN` and `en-US` resources. Primary copy explains the lifecycle consequence:

- use “已安装 / Installed,” not “registered runtime packages”;
- use “此更新需要新的访问权限 / This update requests additional access,” followed by the affected capabilities, not a raw permission diff as the title;
- use “邮件服务正在使用此扩展，暂时无法移除 / This extension is used by the email service and cannot be removed yet,” not a dependency exception alone;
- use “更新未完成，当前版本仍在运行 / Update did not complete; the current version is still running,” when that is the durable result, not a generic failed state.

Manifest ids, checksums, signatures, compatibility ranges, permission codes, operation phases, registry conflicts, and raw logs appear only in authorized detail after the plain-language summary.

## 7. Non-goals

- Capability-specific Provider, sender, model, storage, domain, or authentication configuration.
- Automatic Workspace activation or implicit permission grants after installation.
- Executing an unverified arbitrary package or hiding startup/restart requirements.
- A marketplace engagement Dashboard or install-count cards.
- Treating Workspace-authored Customization as an Extension package.

## 8. Migration contract

The hard cut replaces `/system/plugins` with `/extensions/installed`, `/extensions/catalog`, `/extensions/connections`, `/extensions/history`, and route-backed object detail. The old card-page route, static navigation entry, duplicate configuration forms, settings anchors, and super-admin-only mutation guard are removed after action-scoped Platform Permissions and durable lifecycle operations are available. Existing installed Extensions are backfilled with explicit source, version, trust/verification, compatibility, capability, consumer, and runtime state; unknown evidence remains visibly unknown rather than trusted by default.
