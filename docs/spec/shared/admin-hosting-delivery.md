# Platform Hosting & Delivery Contract

Status: Approved domain contract; experience amended 2026-08-01
Parent: [Platform Control Plane Productization Rollout](./admin-control-plane-rollout.md)
Experience authority: [Product and Platform administration experience redesign](./product-admin-experience-redesign.md)

## 1. Scope

This contract defines one Hosting & Delivery Platform Domain for cross-Workspace site-delivery investigation and recovery, domain and certificate readiness, file-storage operations, delivery policy, Delivery Suspended state, and restoration.

“Hosting & Delivery” is the canonical architecture term. The product label is `托管与域名 / Hosting & Domains`; primary navigation describes recognizable site, domain, certificate, and file-storage tasks rather than infrastructure implementation.

## 2. Current-state evidence

- `/system/settings/domains` currently manages the deployment base domain, Admin subdomain, automatic Project subdomain assignment, and reserved labels without domain-binding, DNS, certificate, or delivery-health operations.
- `/system/settings/storage` manages storage profiles, connection tests, defaults, and upload limits, but presents them as a generic settings category rather than as delivery readiness and affected-work evidence.
- release, artifact, domain binding, certificate association, Hosting Continuity, Delivery Suspended, restoration, and public unavailable-response contracts already exist across publishing and commercialization specs but are not composed into one operator workflow.

## 3. Information architecture

Hosting & Domains opens **Delivery issues** by default and contains these peer operational surfaces:

1. **Delivery issues**: platform-actionable build, deployment, release-delivery, domain, certificate, storage, suspension, and restoration failures with affected Workspace/Project/Site, last successful delivery, current visitor effect, owner, age, and authorized recovery action.
2. **Domains & certificates**: deployment base domains, managed and custom domain readiness, DNS verification, certificate issuance/renewal, binding conflicts, reserved labels, and affected sites.
3. **File storage**: storage services and profiles, default selection, connection/read/write readiness, capacity and upload policy, migration state, and affected assets or delivery paths.
4. **Delivery policies**: managed subdomain assignment, Hosting Continuity policy, public unavailable responses, cache/delivery behavior, and future-transition previews.

The domain has no metric-card Overview. A failed customer build caused only by invalid Project content remains a Product Application result unless it reveals a shared platform fault or requires Platform authority; the delivery queue does not turn every user mistake into an operator incident.

## 4. Authority boundaries

- The Product Application owns Project content, publication intent, release selection, and authorized custom-domain choices. Hosting & Domains may inspect their delivery projection and deep-link to the exact Product surface but cannot edit pages, content, or publication intent.
- Hosting & Delivery owns instance delivery readiness, delivery gates, public response behavior, domain/certificate infrastructure, artifact serving, and storage readiness.
- Commerce owns Payment Grace and Payment Restricted. It publishes source facts only; Hosting & Delivery independently owns Hosting Continuity, Delivery Suspended, cache invalidation, and the restoration result.
- Monitoring & Audit owns historical availability, latency, error, storage-growth, certificate, and delivery trends. Hosting & Domains owns current actionable failures, readiness, and recovery.
- Extensibility owns installation and trust lifecycle for storage or delivery Connectors; Hosting & Domains owns their delivery-specific configuration, readiness, and operational use.
- Workspaces may show an authorized delivery summary and exact deep link for a Workspace or Project, but it does not duplicate Hosting mutation forms.
- Workspace lifecycle deletion remains independent. Delivery Suspended, unused storage, expired certificates, or an unavailable site never authorize data deletion.

## 5. Product copy and i18n

Every visible string uses stable i18n keys with equivalent `zh-CN` and `en-US` resources. Primary copy explains the visitor or operator effect:

- use “站点无法访问 / Site unavailable,” not a raw delivery-state enum;
- use “证书续期失败 / Certificate renewal failed,” followed by affected domains and next action, not an ACME exception as the title;
- use “文件存储连接失败 / File storage connection failed,” not an object-store client error as primary copy;
- use “恢复上次成功发布的版本 / Restore delivery of the last successful release,” not “replay hosting projection.”

DNS records, certificate authority responses, Provider request ids, storage endpoints, artifact ids, cache keys, and raw exceptions appear in authorized diagnostics after the plain-language summary. Errors state the visitor impact, whether delivery or configuration changed, and whether retry is safe.

## 6. Operational behavior

- Delivery state derives from canonical build, release, artifact, binding, certificate, storage, cache, continuity, suspension, and restoration facts; frontend reachability checks do not become the source of truth.
- Readiness distinguishes supported, installed, configured, verified, serving, expiring, degraded, and unavailable conditions instead of one `enabled` flag.
- Mutations use explicit preview when they can affect multiple sites, domains, stored objects, public responses, or future Hosting transitions.
- Retry, restore, certificate renewal, storage test, and cache actions are idempotent, permission-scoped, audited, and explicit about partial or irreversible effects.
- Cross-Workspace infrastructure faults project one owning incident with affected-target evidence rather than generating unrelated duplicate signals for every site.

## 7. Non-goals

- A second Project settings, editor, publish, or custom-domain management surface.
- A generic Domains or Storage settings page.
- A chart dashboard that duplicates Monitoring & Audit.
- Treating every invalid customer build or DNS typo as a platform incident.
- Using delivery or storage state as Workspace deletion authority.

## 8. Migration contract

The hard cut removes `/system/settings/domains` and `/system/settings/storage` after every retained capability moves to `/hosting/issues`, `/hosting/domains`, `/hosting/storage`, or `/hosting/policies` with a Platform Capability, action-scoped Platform Permission, complete lifecycle, readiness, failure, verification, and audit contract. Page registries, search items, wrappers, duplicate forms, old `/site-delivery/**` routes, and aliases are removed together. Current settings that lack authoritative verification or affected-target evidence remain visibly incomplete until the domain supplies it; the UI does not infer healthy delivery from saved configuration or a successful form submission.
