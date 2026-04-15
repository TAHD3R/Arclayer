import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceMenuActions } from "@/pages/usercenter/workspaces/hooks/use-workspace-menu-actions";
import type { UserCenterWorkspaceListItem } from "@/pages/usercenter/workspaces/types";

const useUserCenterWorkspacesMutationsMock = vi.fn();

vi.mock("@/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-mutations", () => ({
  useUserCenterWorkspacesMutations: (...args: unknown[]) =>
    useUserCenterWorkspacesMutationsMock(...args),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  };
}

describe("useWorkspaceMenuActions", () => {
  const updateMutateAsync = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useUserCenterWorkspacesMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: vi.fn() },
      archiveMutation: { isPending: false, mutateAsync: vi.fn() },
      unarchiveMutation: { isPending: false, mutateAsync: vi.fn() },
      deleteMutation: { isPending: false, mutateAsync: vi.fn() },
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

    const workspace: UserCenterWorkspaceListItem = {
      id: "ws-1",
      workspaceId: "ws-1",
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
});
