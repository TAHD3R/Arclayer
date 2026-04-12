import { beforeEach, describe, expect, test, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  listMyWorkspaces: vi.fn(),
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: mocked.listMyWorkspaces,
}));

import { resolvePostAuthRoute } from "@/lib/routing/post-auth-routing";

describe("post-auth-routing", () => {
  beforeEach(() => {
    mocked.listMyWorkspaces.mockReset();
  });

  test("lands on organization overview when no workspace is available", async () => {
    mocked.listMyWorkspaces.mockResolvedValue({ items: [] });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null });
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBeNull();
  });

  test("uses the remembered workspace when it still exists", async () => {
    mocked.listMyWorkspaces.mockResolvedValue({
      items: [{ workspaceId: "w-a", name: "A" }],
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: "w-a" });
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBe("w-a");
  });

  test("falls back to root when no workspace can be resolved", async () => {
    mocked.listMyWorkspaces.mockResolvedValue({ items: [] });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null });
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBeNull();
  });
});
