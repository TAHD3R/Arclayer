import { describe, expect, test } from "vitest";

import {
  pickDefaultWorkspace,
  switchWorkspacePath,
  workspaceHomePath,
} from "@/lib/routing/workspace-routing";

describe("workspace-routing", () => {
  test("pickDefaultWorkspace prefers lastWorkspaceId when it exists in list", () => {
    const workspace = pickDefaultWorkspace({
      workspaces: [
        { workspaceId: "w1", projectId: "p1", name: "A" },
        { workspaceId: "w2", projectId: "p2", name: "B" },
      ],
      lastWorkspaceId: "w2",
    });
    expect(workspace?.workspaceId).toBe("w2");
  });

  test("pickDefaultWorkspace falls back to the only workspace", () => {
    const workspace = pickDefaultWorkspace({
      workspaces: [{ workspaceId: "solo", projectId: "project-solo" }],
      lastWorkspaceId: null,
    });
    expect(workspace?.workspaceId).toBe("solo");
  });

  test("pickDefaultWorkspace returns null when multiple workspaces and no valid lastWorkspaceId", () => {
    const workspace = pickDefaultWorkspace({
      workspaces: [
        { workspaceId: "w1", projectId: "p1", name: "A" },
        { workspaceId: "w2", projectId: "p2", name: "B" },
      ],
      lastWorkspaceId: "missing",
    });
    expect(workspace).toBeNull();
  });

  test("pickDefaultWorkspace returns null when list is empty", () => {
    const workspace = pickDefaultWorkspace({ workspaces: [], lastWorkspaceId: "w1" });
    expect(workspace).toBeNull();
  });

  test("workspaceHomePath builds /projects/:id", () => {
    expect(workspaceHomePath("abc")).toBe("/projects/abc");
  });

  test("switchWorkspacePath replaces /projects/:id prefix when pathname is workspace-scoped", () => {
    const next = switchWorkspacePath({
      pathname: "/projects/old/assets?x=1",
      currentProjectId: "old",
      nextProjectId: "new",
    });
    // We normally receive `pathname` without query, but keep behavior stable even if a query is present.
    expect(next).toBe("/projects/new/assets?x=1");
  });

  test("switchWorkspacePath falls back to /projects/:id/ when pathname is not workspace-scoped", () => {
    const next = switchWorkspacePath({
      pathname: "/login",
      currentProjectId: "old",
      nextProjectId: "new",
    });
    expect(next).toBe("/projects/new/");
  });
});
