import { describe, expect, test } from "vitest";

import { pickDefaultWorkspaceId, switchWorkspacePath, workspaceHomePath } from "./workspaceRouting";

describe("workspaceRouting", () => {
  test("pickDefaultWorkspaceId prefers lastWorkspaceId when it exists in list", () => {
    const id = pickDefaultWorkspaceId({
      workspaces: [
        { workspaceId: "w1", name: "A" },
        { workspaceId: "w2", name: "B" },
      ],
      lastWorkspaceId: "w2",
    });
    expect(id).toBe("w2");
  });

  test("pickDefaultWorkspaceId falls back to the only workspace", () => {
    const id = pickDefaultWorkspaceId({
      workspaces: [{ workspaceId: "solo" }],
      lastWorkspaceId: null,
    });
    expect(id).toBe("solo");
  });

  test("pickDefaultWorkspaceId returns null when multiple workspaces and no valid lastWorkspaceId", () => {
    const id = pickDefaultWorkspaceId({
      workspaces: [
        { workspaceId: "w1", name: "A" },
        { workspaceId: "w2", name: "B" },
      ],
      lastWorkspaceId: "missing",
    });
    expect(id).toBeNull();
  });

  test("pickDefaultWorkspaceId returns null when list is empty", () => {
    const id = pickDefaultWorkspaceId({ workspaces: [], lastWorkspaceId: "w1" });
    expect(id).toBeNull();
  });

  test("workspaceHomePath builds /w/:id", () => {
    expect(workspaceHomePath("abc")).toBe("/w/abc");
  });

  test("switchWorkspacePath replaces /w/:id prefix when pathname is workspace-scoped", () => {
    const next = switchWorkspacePath({
      pathname: "/w/old/assets?x=1",
      currentWorkspaceId: "old",
      nextWorkspaceId: "new",
    });
    // We normally receive `pathname` without query, but keep behavior stable even if a query is present.
    expect(next).toBe("/w/new/assets?x=1");
  });

  test("switchWorkspacePath falls back to /w/:id/ when pathname is not workspace-scoped", () => {
    const next = switchWorkspacePath({
      pathname: "/login",
      currentWorkspaceId: "old",
      nextWorkspaceId: "new",
    });
    expect(next).toBe("/w/new/");
  });
});
