import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import { listProjectPermissionActions } from "@/api/rbac";
import { getMyProjectAuthz } from "@/api/workspaces";
import type { ProjectAuthzSnapshot, ProjectPermissionAction } from "@/types/api";

describe("api/project governance contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("accepts the project authz snapshot shape", () => {
    const snapshot: ProjectAuthzSnapshot = {
      projectId: "project-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      scope: "project",
      roleCodes: ["owner"],
      permissionCodes: ["system:site:manage"],
      isSuperuser: false,
    };

    expect(snapshot.scope).toBe("project");
    expect(snapshot.projectId).toBe("project-1");
  });

  it("accepts the project action catalog shape", () => {
    const action: ProjectPermissionAction = {
      code: "site:manage",
      description: "Manage site",
      subjectKinds: ["workspace_member"],
      permissionCodes: ["system:site:manage"],
    };

    expect(action.code).toBe("site:manage");
    expect(action.permissionCodes).toEqual(["system:site:manage"]);
  });

  it("calls the project governance endpoints with project-native return types", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        projectId: "project-1",
        workspaceId: "workspace-1",
        userId: "user-1",
        scope: "project",
        roleCodes: ["owner"],
        permissionCodes: ["system:site:manage"],
        isSuperuser: false,
      })
      .mockResolvedValueOnce([
        {
          code: "site:manage",
          description: "Manage site",
          subjectKinds: ["workspace_member"],
          permissionCodes: ["system:site:manage"],
        },
      ]);

    const snapshot = await getMyProjectAuthz("project-1");
    const actions = await listProjectPermissionActions("project-1");

    expect(snapshot.projectId).toBe("project-1");
    expect(actions[0]?.code).toBe("site:manage");
    expect(api.get).toHaveBeenNthCalledWith(1, "/projects/project-1/me/authz");
    expect(api.get).toHaveBeenNthCalledWith(2, "/projects/project-1/actions");
  });
});
