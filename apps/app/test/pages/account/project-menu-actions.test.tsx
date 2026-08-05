import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProjectDangerCapabilities } from "@/api/projects";
import { useProjectMenuActions } from "@/pages/usercenter/projects/hooks/use-project-menu-actions";
import type { UserCenterProjectListItem } from "@/pages/usercenter/projects/types";

const useUserCenterProjectsMutationsMock = vi.fn();

vi.mock("@/api/projects", () => ({
  getProjectDangerCapabilities: vi.fn(),
}));

vi.mock("@/pages/usercenter/projects/hooks/use-usercenter-projects-mutations", () => ({
  useUserCenterProjectsMutations: (...args: unknown[]) =>
    useUserCenterProjectsMutationsMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifyErrorText: vi.fn(),
  notifySuccessText: vi.fn(),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  };
}

describe("useProjectMenuActions", () => {
  const updateMutateAsync = vi.fn().mockResolvedValue(undefined);
  const archiveMutateAsync = vi.fn().mockResolvedValue(undefined);
  const unarchiveMutateAsync = vi.fn().mockResolvedValue(undefined);
  const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProjectDangerCapabilities).mockResolvedValue({
      projectId: "project-1",
      workspaceId: "ws-1",
      confirmDeleteName: "Project Alpha",
      archiveAction: {
        enabled: true,
        blockedReason: null,
      },
      deleteAction: {
        enabled: true,
        blockedReason: null,
      },
    });
    useUserCenterProjectsMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: vi.fn() },
      archiveMutation: { isPending: false, mutateAsync: archiveMutateAsync },
      unarchiveMutation: { isPending: false, mutateAsync: unarchiveMutateAsync },
      deleteMutation: { isPending: false, mutateAsync: deleteMutateAsync },
      updateMutation: { isPending: false, mutateAsync: updateMutateAsync },
    });
  });

  it("clears iconUrl on confirm after switching away from image mode", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);

    const project: UserCenterProjectListItem = {
      id: "project-1",
      projectId: "project-1",
      workspaceId: "ws-1",
      slug: "alpha",
      name: "Project Alpha",
      description: null,
      iconMode: "image",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
      iconUrl: "/assets/icon-1",
      isArchived: false,
      archivedAt: null,
      archivedByUserId: null,
      memberCount: 2,
      membersPreview: [],
      createdAt: "2026-04-15T00:00:00Z",
      updatedAt: "2026-04-16T00:00:00Z",
      enterable: true,
      primaryRuntime: null,
    };

    const { result } = renderHook(
      () =>
        useProjectMenuActions({
          t: ((key: string) => key) as never,
          onEnterProject: vi.fn(),
          onManageProject: vi.fn(),
        }),
      { wrapper },
    );

    const menuItems = result.current.buildMenuItems(project);
    const changeIconItem = menuItems.find(
      (item): item is Exclude<(typeof menuItems)[number], { type: "divider" }> =>
        item.type !== "divider" && item.key === "change-icon",
    );
    expect(changeIconItem).toBeDefined();
    if (!changeIconItem) throw new Error("Expected change-icon menu item");

    await act(async () => {
      changeIconItem.onClick?.();
    });

    await act(async () => {
      result.current.iconDialog.setValues((prev) => ({
        ...prev,
        iconMode: "glyph",
        iconGlyph: "rocket",
      }));
    });

    await act(async () => {
      await result.current.iconDialog.onConfirm();
    });

    expect(updateMutateAsync).toHaveBeenCalledWith({
      projectId: "project-1",
      patch: {
        iconMode: "glyph",
        iconColor: "#337ea9",
        iconGlyph: "rocket",
        iconEmoji: null,
        iconUrl: null,
      },
    });
  });

  it("prepares danger capabilities through query cache without rerendering the menu hook", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);

    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount += 1;
        return useProjectMenuActions({
          t: ((key: string) => key) as never,
          onEnterProject: vi.fn(),
          onManageProject: vi.fn(),
        });
      },
      { wrapper },
    );
    const renderCountBeforePrepare = renderCount;

    await act(async () => {
      result.current.prepareProjectDangerCapabilities("project-1");
      await vi.waitFor(() =>
        expect(getProjectDangerCapabilities).toHaveBeenCalledWith("project-1"),
      );
    });

    expect(renderCount).toBe(renderCountBeforePrepare);
    expect(queryClient.getQueryData(["project", "danger-capabilities", "project-1"])).toMatchObject(
      {
        projectId: "project-1",
        archiveAction: { enabled: true },
        deleteAction: { enabled: true },
      },
    );
  });

  it("opens archive and delete dialogs for active projects", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);
    const project: UserCenterProjectListItem = {
      id: "project-1",
      projectId: "project-1",
      workspaceId: "ws-1",
      slug: "alpha",
      name: "Project Alpha",
      description: null,
      iconMode: "initials",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
      iconUrl: null,
      isArchived: false,
      archivedAt: null,
      archivedByUserId: null,
      memberCount: 1,
      membersPreview: [],
      createdAt: "2026-04-15T00:00:00Z",
      updatedAt: "2026-04-16T00:00:00Z",
      enterable: true,
      primaryRuntime: null,
    };

    const { result } = renderHook(
      () =>
        useProjectMenuActions({
          t: ((key: string) => key) as never,
          onEnterProject: vi.fn(),
          onManageProject: vi.fn(),
        }),
      { wrapper },
    );

    const menuItems = result.current.buildMenuItems(project);
    const archiveItem = menuItems.find(
      (item): item is Exclude<(typeof menuItems)[number], { type: "divider" }> =>
        item.type !== "divider" && item.key === "archive",
    );
    const deleteItem = menuItems.find(
      (item): item is Exclude<(typeof menuItems)[number], { type: "divider" }> =>
        item.type !== "divider" && item.key === "delete",
    );

    await act(async () => {
      archiveItem?.onClick?.();
      deleteItem?.onClick?.();
    });

    expect(result.current.archiveDialog.project).toMatchObject({
      projectId: "project-1",
      name: "Project Alpha",
    });
    expect(result.current.deleteDialog.project).toMatchObject({
      projectId: "project-1",
      name: "Project Alpha",
    });
  });

  it("offers unarchive and delete actions for archived projects", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);
    const project: UserCenterProjectListItem = {
      id: "project-1",
      projectId: "project-1",
      workspaceId: "ws-1",
      slug: "alpha",
      name: "Project Alpha",
      description: null,
      iconMode: "initials",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
      iconUrl: null,
      isArchived: true,
      archivedAt: "2026-04-18T00:00:00Z",
      archivedByUserId: null,
      memberCount: 1,
      membersPreview: [],
      createdAt: "2026-04-15T00:00:00Z",
      updatedAt: "2026-04-16T00:00:00Z",
      enterable: true,
      primaryRuntime: null,
    };

    const { result } = renderHook(
      () =>
        useProjectMenuActions({
          t: ((key: string) => key) as never,
          onEnterProject: vi.fn(),
          onManageProject: vi.fn(),
        }),
      { wrapper },
    );

    const menuItems = result.current.buildMenuItems(project);
    expect(menuItems).toHaveLength(2);

    await act(async () => {
      if (menuItems[0]?.type !== "divider") {
        menuItems[0]?.onClick?.();
      }
      if (menuItems[1]?.type !== "divider") {
        menuItems[1]?.onClick?.();
      }
    });

    expect(unarchiveMutateAsync).toHaveBeenCalledWith("project-1");
    expect(result.current.deleteDialog.project).toMatchObject({
      projectId: "project-1",
      name: "Project Alpha",
    });
  });
});
