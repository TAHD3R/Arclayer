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

  test("lands on project overview when no workspace is available", async () => {
    mocked.listMyWorkspaces.mockResolvedValue({
      items: [],
      switcher: {
        teams: [],
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "completed", workspaceId: null },
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null });
    expect(decision.path).toBe("/projects");
    expect(decision.workspaceId).toBeNull();
    expect(decision.onboardingRequired).toBe(false);
  });

  test("uses the remembered workspace when it still exists", async () => {
    const workspace = {
      workspaceId: "w-a",
      projectId: "project-a",
      slug: "a",
      name: "A",
      kind: "team" as const,
      visibleOnly: false,
      isCreatorAdmin: true,
    };

    mocked.listMyWorkspaces.mockResolvedValue({
      items: [workspace],
      switcher: {
        teams: [workspace],
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "completed", workspaceId: null },
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: "w-a" });
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBe("w-a");
    expect(decision.projectId).toBe("project-a");
    expect(decision.onboardingRequired).toBe(false);
  });

  test("falls back to root when multiple team workspaces are available without a remembered match", async () => {
    const firstWorkspace = {
      workspaceId: "w-a",
      projectId: "project-a",
      slug: "alpha",
      name: "Alpha",
      kind: "team" as const,
      visibleOnly: false,
      isCreatorAdmin: true,
    };
    const secondWorkspace = {
      workspaceId: "w-team",
      projectId: "project-team",
      slug: "team-space",
      name: "Team Space",
      kind: "team" as const,
      visibleOnly: false,
      isCreatorAdmin: true,
    };

    mocked.listMyWorkspaces.mockResolvedValue({
      items: [firstWorkspace, secondWorkspace],
      switcher: {
        teams: [firstWorkspace, secondWorkspace],
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "completed", workspaceId: null },
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null });
    expect(decision.path).toBe("/projects");
    expect(decision.workspaceId).toBeNull();
    expect(decision.onboardingRequired).toBe(false);
  });

  test("falls back to root when no workspace can be resolved", async () => {
    mocked.listMyWorkspaces.mockResolvedValue({
      items: [],
      switcher: {
        teams: [],
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "completed", workspaceId: null },
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null });
    expect(decision.path).toBe("/projects");
    expect(decision.workspaceId).toBeNull();
    expect(decision.onboardingRequired).toBe(false);
  });

  test("routes first login to welcome and marks onboarding as required", async () => {
    const workspace = {
      workspaceId: "w-a",
      projectId: "project-a",
      slug: "a",
      name: "A",
      kind: "team" as const,
      visibleOnly: false,
      isCreatorAdmin: true,
    };

    mocked.listMyWorkspaces.mockResolvedValue({
      items: [workspace],
      switcher: {
        teams: [workspace],
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "pending_workspace", workspaceId: null },
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: "w-a" });
    expect(decision.path).toBe("/welcome");
    expect(decision.workspaceId).toBeNull();
    expect(decision.onboardingRequired).toBe(true);
  });

  test("keeps onboarding blocked on welcome until defaults are confirmed", async () => {
    mocked.listMyWorkspaces.mockResolvedValue({
      items: [],
      switcher: {
        teams: [],
      },
      instanceSetup: { status: "ready", repairReason: null },
      onboarding: { status: "pending_workspace_defaults", workspaceId: "w-step-2" },
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null });
    expect(decision.path).toBe("/welcome");
    expect(decision.workspaceId).toBeNull();
    expect(decision.onboardingRequired).toBe(true);
  });
});
