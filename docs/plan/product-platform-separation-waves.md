# Product/Platform 分离实施波次记录

- 来源：自 `docs/spec/shared/product-platform-separation.md` §13 拆出（2026-08-17）
- 状态：Wave 0-9 已执行，Platform Console 随一次性发布边界切换上线（ADR-0043）
- 权威关系：边界与权威契约仍以 separation 契约为准；本文件是执行期交付记录，不是活跃计划

以下为迁移原文。

## Wave 0 — Contract freeze and inventory

- treat this file and every routed topic contract as the implementation baseline;
- inventory every `/system` route, Platform component, API client, store, locale key, route skeleton, test, backend route, super-admin dependency, creator-admin path, mutable commercial record, trial state, and existing Workspace Owner value;
- define deterministic migration outcomes and stop on ambiguous records;
- establish focused residue scans and contract tests before moving code.

## Wave 1 — Workspace ownership and authority hard cut

- backfill and enforce one non-null `Workspace.owner_user_id` per active Workspace;
- initialize ownership on every creation path and add explicit transfer authority;
- remove `is_creator_admin`, creator-admin membership/role bootstrap, Organization-derived Workspace authority, and assignable Owner-role semantics;
- update Workspace, Project, billing, support-access, deletion, invitation, and permission boundaries to consume canonical ownership;
- prove Free Workspace Allowance under creation, downgrade, and transfer concurrency.

## Wave 2 — Monorepo and application foundations

- add `apps/platform`, package scripts, Turbo tasks, workspace registration, build output, test setup, locale parity checks, and host configuration;
- adapt the reviewed shadcn-admin donor shell through `@arclayer/ui` and Arclayer tokens;
- establish independent Product and Platform route trees, app bootstrap, error boundaries, and shared route-skeleton composition;
- keep Platform inaccessible as the official production entry until the final cutover gate.

## Wave 3 — API composition and Platform security foundation

- split Product API and Platform API composition roots, OpenAPI documents, generated clients, middleware, origin/cookie/session policy, and route allowlists;
- implement Platform Entry Eligibility as discoverability only;
- establish Instance Owner, Platform Operator invitation, roles, exact permissions, Platform MFA, device Sessions, Step-up verification, transfer, recovery, and Audit;
- prove cross-credential denial before migrating Platform pages.

## Wave 4 — Product Application navigation and Workspace administration

- remove Platform navigation and route ownership from Product Application source;
- hard-cut Workspace Administration to General, Plan & Usage, People, and conditional Roles & Permissions;
- move Knowledge, Skills, and Design Systems into the peer Customization group and remove redundant Workspace copy;
- implement natural bilingual copy, responsive navigation, explicit states, and no protected page mount for unavailable role management.

## Wave 5 — Workspace commercialization and access convergence

- implement non-expiring Free Plan, Free Workspace Allowance, immutable Plan Revisions, active Project limits, tenant billing authority, Feature Seats, assignment UI, and independent runtime gates;
- migrate mutable Plans, Plan-only mappings, trial states, and legacy approval workflows through explicit retirement rules;
- implement Plan Access Convergence, Restricted Recovery Mode, commercial lifecycle notifications, and Commerce-to-Hosting facts without cross-domain mutation.

## Wave 6 — Platform shell, capabilities, and first operational verticals

- implement the capability-driven Sidebar, Command Center, independent locales, personal Saved views, explicit bulk-action capabilities, and domain-owned configuration;
- ship Overview, Needs attention, and Monitoring & Audit from real persisted sources;
- ship Access & Security and Workspaces with exact permissions, redaction, support-access grants, and no duplicated Product management forms.

## Wave 7 — Platform commercial and runtime operations

- ship Plans & Billing with Plan/Revisions, Subscriptions, provider events, Credits, corrections, configuration readiness, and exact Workspace deep links;
- ship AI Services and Hosting & Domains queues, readiness, configuration, durable recovery operations, and cross-domain projections;
- retain commercial, Hosting, AI, Monitoring, and tenant authorities separately.

## Wave 8 — Communications and Extensibility

- ship Messages & feedback with one delivery authority, real feedback operations, Campaigns, templates, provider readiness, and delivery retry evidence;
- ship Extensions with trusted catalog, install/update history, compatibility, permission review, rollback, and consuming-domain configuration links;
- remove legacy Plugins, Notifications, Email, Feedback, and global Configuration page families after their replacement verticals pass acceptance.

## Wave 9 — One-boundary Platform cutover

- enable the independently hosted Platform Console only after all retained Platform capabilities, permissions, migrations, bilingual copy, and browser scenarios pass;
- remove every Platform route, navigation entry, page, client, store, locale key, skeleton, test, and build reference from `apps/app` in the same release boundary;
- remove legacy Platform API routes, `require_super_admin` compatibility authority, aliases, facades, and old generated client surfaces;
- retain only explicitly documented forward-compatible database changes needed to rehearse rollback of the previous complete release, followed by a declared retirement migration.
