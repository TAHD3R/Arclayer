import type { Permission, Role, WorkspacePermissionCatalog } from "@arclayer/openapi/admin-types";
import { describe, expect, it } from "vitest";

import {
  diffCatalogDefinitions,
  preserveCompatibleDraft,
} from "@/pages/workspaces/team/roles/components/permission-catalog-state";

function permission(code: string, overrides: Partial<Permission> = {}): Permission {
  return {
    id: `permission-${code}`,
    code,
    scope: "workspace",
    name: code,
    description: `${code} description`,
    groupCode: "content",
    groupName: "Content",
    sortOrder: 100,
    ownerKey: "core",
    ownerName: "Core",
    lifecycle: "active",
    replacementCode: null,
    actionCodes: [],
    conditionTemplates: [],
    ...overrides,
  };
}

function role(code: string, overrides: Partial<Role> = {}): Role {
  return {
    id: `role-${code}`,
    code,
    name: code,
    description: `${code} description`,
    isDefault: false,
    isSuperuser: false,
    isSystem: false,
    source: "custom",
    immutable: false,
    revision: `${code}-revision`,
    permissionCodes: [],
    permissionGrants: [],
    ...overrides,
  };
}

function catalog(permissions: Permission[]): WorkspacePermissionCatalog {
  return {
    catalogRevision: "catalog-revision",
    etag: '"catalog-etag"',
    groups: [],
    roles: [],
    permissions,
    actions: [],
    conditionTemplates: [],
  };
}

describe("permission catalog state", () => {
  it("reports added, changed, and removed permission definitions by stable code", () => {
    const previous = catalog([
      permission("content.read"),
      permission("content.write"),
      permission("content.removed"),
    ]);
    const next = catalog([
      permission("content.read"),
      permission("content.write", { lifecycle: "deprecated" }),
      permission("content.added"),
    ]);

    expect(diffCatalogDefinitions(previous, next)).toEqual({
      added: ["content.added"],
      changed: ["content.write"],
      removed: ["content.removed"],
    });
  });

  it("keeps compatible custom drafts while refreshing immutable and new roles from the server", () => {
    const nextRoles = [
      role("custom_editor", {
        permissionCodes: ["content.read"],
        permissionGrants: [{ permissionCode: "content.read", conditionSets: [] }],
      }),
      role("owner", {
        isSystem: true,
        source: "system",
        immutable: true,
        permissionCodes: ["content.write"],
        permissionGrants: [{ permissionCode: "content.write", conditionSets: [] }],
      }),
      role("custom_new", {
        permissionCodes: ["content.read"],
        permissionGrants: [{ permissionCode: "content.read", conditionSets: [] }],
      }),
    ];
    const previousDraft = {
      custom_editor: [
        { permissionCode: "content.write", conditionSets: [] },
        { permissionCode: "content.removed", conditionSets: [] },
      ],
      owner: [],
    };

    expect(
      preserveCompatibleDraft(
        nextRoles,
        [permission("content.read"), permission("content.write")],
        previousDraft,
      ),
    ).toEqual({
      custom_editor: [{ permissionCode: "content.write", conditionSets: [] }],
      owner: [{ permissionCode: "content.write", conditionSets: [] }],
      custom_new: [{ permissionCode: "content.read", conditionSets: [] }],
    });
  });
});
