# 2026-02-08 Project Audit and Capability Gap Matrix

## Scope

- Repository-wide architecture and quality review for the self-host-first roadmap
- Focus areas: coding standards, missing capabilities, complexity hotspots, and workaround debt

## Priority Findings

### P0 - Strategic blockers

1. **Open platform core capabilities are missing**
   - API Keys and Webhooks are still placeholder surfaces in admin settings.
   - Evidence:
     - `apps/web/admin/src/pages/settings/organization/page.tsx:200`
     - `apps/web/admin/src/pages/settings/workspace/page.tsx:525`

2. **Plugin system is strong at declaration, weaker at runtime composability**
   - Extension declarations exist, but runtime rendering/interaction contracts are shallow.
   - Evidence:
     - `apps/api/plugin/hooks.py:22`
     - `apps/web/admin/src/components/extensions/admin-extensions-slot.tsx:73`
     - `apps/web/portal/src/runtime/site-api.ts:213`

3. **Architecture boundary drift (core imports modules)**
   - Core startup path still directly depends on domain modules.
   - Evidence:
     - `apps/api/core/registry.py:28`

4. **High-complexity files in core paths**
   - Multiple files exceed maintainability budgets and carry orchestration + domain logic mixed together.
   - Evidence:
     - `apps/api/modules/sites/service.py:1`
     - `apps/api/modules/auth/service.py:1`
     - `apps/api/modules/sites/repository.py:1`

### P1 - Quality and consistency gaps

1. **Frontend any usage violates strict typing policy**
   - Evidence:
     - `apps/web/admin/src/pages/assets/page.tsx:124`
     - `apps/web/admin/src/layouts/admin-layout.tsx:425`

2. **User-facing hardcoded locale strings still exist**
   - Evidence:
     - `apps/web/admin/src/components/common/admin-toggle-locales.tsx:23`

3. **Route-level lazy loading is not broadly enforced**
   - Evidence:
     - `apps/web/admin/src/layouts/auth-layout.tsx:13`

4. **Duplicated plugin detail experiences create maintenance overhead**
   - Evidence:
     - `apps/web/admin/src/routes/w/$workspaceId/plugins/$pluginSlug/index.tsx:1`
     - `apps/web/admin/src/pages/plugins/organization-plugin-detail/page.tsx:1`

### P2 - Ecosystem maturity risks

1. **Marketplace flow not active yet**
   - Evidence:
     - `apps/web/admin/src/routes/plugins/marketplace/index.tsx:10`

2. **Portal still carries sprint bootstrap artifacts**
   - Evidence:
     - `apps/web/portal/src/runtime/hardcoded-document.ts:8`
     - `packages/site-renderer-core/README.md:11`

## Capability Gap Matrix

| Capability | Current State | Gap Level | Recommended Phase |
| --- | --- | --- | --- |
| API Keys | UI placeholder only | Critical | Phase 2 |
| Webhooks | UI placeholder only | Critical | Phase 2 |
| Third-party app integration | Planned in docs, no concrete backend domain | High | Phase 2 |
| Plugin runtime contracts (admin + portal) | Declaration-first, runtime execution shallow | High | Phase 1-2 |
| AI-native infrastructure | No concrete domain contracts yet | High | Phase 3 |
| Self-host operational hardening | Good baseline, but complexity and broad-except debt remain | Medium | Phase 1 |

## Audit Outcome

The project has a solid modular baseline and plugin architecture direction. Before implementing major new platform capabilities, we should complete quality governance and boundary cleanup to reduce future change risk.
