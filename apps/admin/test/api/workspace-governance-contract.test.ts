import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import * as rbacApi from "@/api/rbac";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
import type { AuthzSnapshot, PageData, Permission, Role } from "@/types/api";
import type { WorkspacePermissionAction } from "@/types/api/rbac";

describe("api/workspace governance contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("accepts the workspace authz snapshot shape", () => {
    const snapshot: AuthzSnapshot = {
      userId: "user-1",
      roleCodes: ["owner"],
      permissionCodes: ["system:content:manage"],
      isSuperuser: true,
    };

    expect(snapshot.roleCodes).toEqual(["owner"]);
    expect(snapshot.isSuperuser).toBe(true);
  });

  it("accepts direct workspace role and action contracts without a matrix residue", () => {
    const roles: PageData<Role> = {
      items: [
        {
          id: "role-1",
          code: "editor",
          name: "Editor",
          description: "Can edit content",
          permissionCodes: ["system:content:read", "system:content:manage"],
          isDefault: false,
          isSuperuser: false,
          isSystem: false,
        },
      ],
      total: 1,
      page: 1,
      size: 200,
      pages: 1,
      next: null,
      prev: null,
    };
    const permissions: PageData<Permission> = {
      items: [
        {
          id: "permission-1",
          code: "system:content:read",
          name: "Read content",
          description: "View workspace content",
          ownerKey: "core",
          ownerName: "Core",
        },
      ],
      total: 1,
      page: 1,
      size: 200,
      pages: 1,
      next: null,
      prev: null,
    };
    const action: WorkspacePermissionAction = {
      code: "content:items:write",
      description: "Mutate content items",
      subjectKinds: ["workspace_member"],
      permissionCodes: ["system:content:manage"],
    };

    expect(roles.items[0]?.permissionCodes).toEqual([
      "system:content:read",
      "system:content:manage",
    ]);
    expect(permissions.items[0]?.code).toBe("system:content:read");
    expect(action.permissionCodes).toEqual(["system:content:manage"]);
    expect("getWorkspaceRbacMatrix" in rbacApi).toBe(false);
  });

  it("calls workspace authz, roles, permissions, and actions endpoints directly", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        userId: "user-1",
        roleCodes: ["owner"],
        permissionCodes: ["system:content:manage"],
        isSuperuser: true,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        size: 200,
        pages: 0,
        next: null,
        prev: null,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        size: 200,
        pages: 0,
        next: null,
        prev: null,
      })
      .mockResolvedValueOnce([]);

    await getMyWorkspaceAuthz("workspace-1");
    await rbacApi.listWorkspaceRoles("workspace-1");
    await rbacApi.listWorkspacePermissions("workspace-1");
    await rbacApi.listWorkspacePermissionActions("workspace-1");

    expect(api.get).toHaveBeenNthCalledWith(1, "/workspaces/workspace-1/me/authz");
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      "/workspaces/workspace-1/rbac/roles?page=1&size=200",
    );
    expect(api.get).toHaveBeenNthCalledWith(
      3,
      "/workspaces/workspace-1/rbac/permissions?page=1&size=200",
    );
    expect(api.get).toHaveBeenNthCalledWith(4, "/workspaces/workspace-1/rbac/actions");
  });
});
