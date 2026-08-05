import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProjectDetailMock, setCurrentContextMock, workspaceState } = vi.hoisted(() => ({
  getProjectDetailMock: vi.fn(),
  setCurrentContextMock: vi.fn(),
  workspaceState: {
    currentWorkspaceId: null as string | null,
    currentProjectId: null as string | null,
    lastWorkspaceId: null as string | null,
    lastProjectId: null as string | null,
    setCurrentContext: vi.fn(),
  },
}));

workspaceState.setCurrentContext = setCurrentContextMock;

vi.mock("@/api/projects", () => ({
  getProjectDetail: getProjectDetailMock,
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: {
    getState: () => workspaceState,
  },
}));

import { Route } from "@/routes/projects/$projectId";

describe("project route context preload", () => {
  beforeEach(() => {
    workspaceState.currentWorkspaceId = null;
    workspaceState.currentProjectId = null;
    workspaceState.lastWorkspaceId = null;
    workspaceState.lastProjectId = null;
    setCurrentContextMock.mockReset();
    getProjectDetailMock.mockReset();
  });

  it("reuses the live workspace context when the target project already matches the store", async () => {
    workspaceState.currentWorkspaceId = "workspace-live";
    workspaceState.currentProjectId = "project-live";

    await Route.options.beforeLoad?.({
      params: { projectId: "project-live" },
    } as never);

    expect(getProjectDetailMock).not.toHaveBeenCalled();
    expect(setCurrentContextMock).toHaveBeenCalledWith({
      workspaceId: "workspace-live",
      projectId: "project-live",
    });
  });

  it("revalidates a persisted project instead of trusting the last workspace pair", async () => {
    workspaceState.lastWorkspaceId = "workspace-last";
    workspaceState.lastProjectId = "project-last";
    getProjectDetailMock.mockResolvedValue({
      project: {
        id: "project-last",
        workspaceId: "workspace-verified",
      },
    });

    await Route.options.beforeLoad?.({
      params: { projectId: "project-last" },
    } as never);

    expect(getProjectDetailMock).toHaveBeenCalledWith("project-last");
    expect(setCurrentContextMock).toHaveBeenCalledWith({
      workspaceId: "workspace-verified",
      projectId: "project-last",
    });
  });

  it("fetches project detail when there is no cached workspace context", async () => {
    getProjectDetailMock.mockResolvedValue({
      project: {
        id: "project-fetch",
        workspaceId: "workspace-fetch",
      },
    });

    await Route.options.beforeLoad?.({
      params: { projectId: "project-fetch" },
    } as never);

    expect(getProjectDetailMock).toHaveBeenCalledWith("project-fetch");
    expect(setCurrentContextMock).toHaveBeenCalledWith({
      workspaceId: "workspace-fetch",
      projectId: "project-fetch",
    });
  });
});
