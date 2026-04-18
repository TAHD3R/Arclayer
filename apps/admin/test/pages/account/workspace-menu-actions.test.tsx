import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkspaceDangerCapabilities } from "@/api/workspaces";
import { useWorkspaceMenuActions } from "@/pages/usercenter/workspaces/hooks/use-workspace-menu-actions";
import type { UserCenterWorkspaceListItem } from "@/pages/usercenter/workspaces/types";

const useUserCenterWorkspacesMutationsMock = vi.fn();
const notifyErrorTextMock = vi.fn();

vi.mock("@/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-mutations", () => ({
  useUserCenterWorkspacesMutations: (...args: unknown[]) =>
    useUserCenterWorkspacesMutationsMock(...args),
}));

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDangerCapabilities: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifyErrorText: (...args: unknown[]) => notifyErrorTextMock(...args),
  notifySuccessText: vi.fn(),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  };
}

describe("useWorkspaceMenuActions", () => {
  const updateMutateAsync = vi.fn().mockResolvedValue(undefined);
  const archiveMutateAsync = vi.fn().mockResolvedValue(undefined);
  const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useUserCenterWorkspacesMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: vi.fn() },
      archiveMutation: { isPending: false, mutateAsync: archiveMutateAsync },
      unarchiveMutation: { isPending: false, mutateAsync: vi.fn() },
      deleteMutation: { isPending: false, mutateAsync: deleteMutateAsync },
      updateMutation: { isPending: false, mutateAsync: updateMutateAsync },
    });
    vi.mocked(getWorkspaceDangerCapabilities).mockResolvedValue({
      workspaceId: "ws-1",
      organizationId: "org-1",
      confirmLeaveText: "LEAVE",
      confirmDeleteName: "Workspace Alpha",
      leaveAction: { enabled: true, blockedReason: null },
      deleteAction: { enabled: true, blockedReason: null },
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

    const workspace: UserCenterWorkspaceListItem = {
      id: "ws-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      organizationId: "org-1",
      slug: "alpha",
      name: "Workspace Alpha",
      description: null,
      kind: "team",
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
      enterable: true,
    };

    const { result } = renderHook(
      () =>
        useWorkspaceMenuActions({
          t: ((key: string) => key) as never,
          onEnterWorkspace: vi.fn(),
          onManageWorkspace: vi.fn(),
        }),
      { wrapper },
    );

    const menuItems = result.current.buildMenuItems(workspace);
    const editGroup = menuItems.find(
      (item): item is Exclude<(typeof menuItems)[number], { type: "divider" }> =>
        item.type !== "divider" && item.key === "edit-workspace",
    );
    expect(editGroup).toBeDefined();
    if (!editGroup) {
      throw new Error("Expected edit-workspace menu group");
    }

    const changeIconItem = editGroup.children?.find(
      (
        item,
      ): item is Exclude<NonNullable<typeof editGroup.children>[number], { type: "divider" }> =>
        item.type !== "divider" && item.key === "change-icon",
    );
    expect(changeIconItem).toBeDefined();
    if (!changeIconItem) {
      throw new Error("Expected change-icon menu item");
    }

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
      workspaceId: "ws-1",
      patch: {
        iconMode: "glyph",
        iconColor: "#337ea9",
        iconGlyph: "rocket",
        iconEmoji: null,
        iconUrl: null,
      },
    });
  });

  it("blocks archive from the menu when workspace leave guard is disabled", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);
    const workspace: UserCenterWorkspaceListItem = {
      id: "ws-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      organizationId: "org-1",
      slug: "alpha",
      name: "Workspace Alpha",
      description: null,
      kind: "team",
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
      enterable: true,
    };
    vi.mocked(getWorkspaceDangerCapabilities).mockResolvedValue({
      workspaceId: "ws-1",
      organizationId: "org-1",
      confirmLeaveText: "LEAVE",
      confirmDeleteName: "Workspace Alpha",
      leaveAction: { enabled: false, blockedReason: "WORKSPACE_OWNER_AT_LEAST_ONE_REQUIRED" },
      deleteAction: { enabled: true, blockedReason: null },
    });

    const { result } = renderHook(
      () =>
        useWorkspaceMenuActions({
          t: ((key: string) =>
            (
              ({
                "errors:WORKSPACE_OWNER_AT_LEAST_ONE_REQUIRED": "工作空间至少需要保留一名所有者",
              }) as Record<string, string>
            )[key] ?? key) as never,
          onEnterWorkspace: vi.fn(),
          onManageWorkspace: vi.fn(),
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prefetchWorkspaceDangerCapabilities("ws-1");
    });

    const menuItems = result.current.buildMenuItems(workspace);
    const archiveGroup = menuItems.find(
      (item): item is Exclude<(typeof menuItems)[number], { type: "divider" }> =>
        item.type !== "divider" && item.key === "archive-trash",
    );
    const archiveItem = archiveGroup?.children?.find(
      (
        item,
      ): item is Exclude<NonNullable<typeof archiveGroup.children>[number], { type: "divider" }> =>
        item.type !== "divider" && item.key === "archive",
    );

    expect(archiveItem).toBeDefined();
    expect(archiveItem?.disabled).toBe(true);

    expect(result.current.archiveDialog.workspace).toBeNull();
    expect(archiveMutateAsync).not.toHaveBeenCalled();
    expect(notifyErrorTextMock).not.toHaveBeenCalled();
  });

  it("blocks delete from the menu when workspace delete guard is disabled", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);
    const workspace: UserCenterWorkspaceListItem = {
      id: "ws-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      organizationId: "org-1",
      slug: "alpha",
      name: "Workspace Alpha",
      description: null,
      kind: "team",
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
      enterable: true,
    };
    vi.mocked(getWorkspaceDangerCapabilities).mockResolvedValue({
      workspaceId: "ws-1",
      organizationId: "org-1",
      confirmLeaveText: "LEAVE",
      confirmDeleteName: "Workspace Alpha",
      leaveAction: { enabled: true, blockedReason: null },
      deleteAction: { enabled: false, blockedReason: "LAST_ACTIVE_WORKSPACE_NOT_DELETABLE" },
    });

    const { result } = renderHook(
      () =>
        useWorkspaceMenuActions({
          t: ((key: string) =>
            (
              ({
                "errors:LAST_ACTIVE_WORKSPACE_NOT_DELETABLE":
                  "当前组织至少需要保留一个激活工作空间，不能删除最后一个工作空间",
              }) as Record<string, string>
            )[key] ?? key) as never,
          onEnterWorkspace: vi.fn(),
          onManageWorkspace: vi.fn(),
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.prefetchWorkspaceDangerCapabilities("ws-1");
    });

    const menuItems = result.current.buildMenuItems(workspace);
    const archiveGroup = menuItems.find(
      (item): item is Exclude<(typeof menuItems)[number], { type: "divider" }> =>
        item.type !== "divider" && item.key === "archive-trash",
    );
    const deleteItem = archiveGroup?.children?.find(
      (
        item,
      ): item is Exclude<NonNullable<typeof archiveGroup.children>[number], { type: "divider" }> =>
        item.type !== "divider" && item.key === "delete",
    );

    expect(deleteItem).toBeDefined();
    expect(deleteItem?.disabled).toBe(true);

    expect(result.current.deleteDialog.workspace).toBeNull();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(notifyErrorTextMock).not.toHaveBeenCalled();
  });
});
