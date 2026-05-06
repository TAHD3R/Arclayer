import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import { listOrganizationPermissionActions } from "@/api/rbac";
import { getMyOrganizationAuthz } from "@/api/workspaces";
import type { OrganizationAuthzSnapshot } from "@arclayer/openapi/admin-types";
import type { OrganizationPermissionAction } from "@arclayer/openapi/admin-types";

describe("api/organization governance contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("accepts the organization authz snapshot shape", () => {
    const snapshot: OrganizationAuthzSnapshot = {
      organizationId: "organization-1",
      userId: "user-1",
      scope: "organization",
      roleCodes: ["owner"],
      permissionCodes: ["org.settings.delete"],
      isSuperuser: false,
    };

    expect(snapshot.scope).toBe("organization");
    expect(snapshot.organizationId).toBe("organization-1");
  });

  it("accepts the organization action catalog shape", () => {
    const action: OrganizationPermissionAction = {
      code: "org.settings.delete",
      description: "Delete organization and all scoped settings.",
      subjectKinds: ["organization_member"],
      permissionCodes: ["org.settings.delete"],
    };

    expect(action.code).toBe("org.settings.delete");
    expect(action.permissionCodes).toEqual(["org.settings.delete"]);
  });

  it("calls the organization governance endpoints with organization-native return types", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        organizationId: "organization-1",
        userId: "user-1",
        scope: "organization",
        roleCodes: ["owner"],
        permissionCodes: ["org.settings.delete"],
        isSuperuser: false,
      })
      .mockResolvedValueOnce([
        {
          code: "org.settings.delete",
          description: "Delete organization and all scoped settings.",
          subjectKinds: ["organization_member"],
          permissionCodes: ["org.settings.delete"],
        },
      ]);

    const snapshot = await getMyOrganizationAuthz();
    const actions = await listOrganizationPermissionActions();

    expect(snapshot.organizationId).toBe("organization-1");
    expect(actions[0]?.code).toBe("org.settings.delete");
    expect(api.get).toHaveBeenNthCalledWith(1, "/organizations/me/authz");
    expect(api.get).toHaveBeenNthCalledWith(2, "/organizations/me/actions");
  });
});
