import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUserCenterWorkspacesMutations } from "@/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-mutations";
import {
  checkOrganizationWorkspaceSlugAvailability,
  createOrganizationWorkspace,
} from "@/api/organization-workspaces";
import { patchWorkspaceDetail } from "@/api/workspaces";

vi.mock("@/api/organization-workspaces", () => ({
  checkOrganizationWorkspaceSlugAvailability: vi.fn(),
  createOrganizationWorkspace: vi.fn(),
  archiveOrganizationWorkspace: vi.fn(),
  unarchiveOrganizationWorkspace: vi.fn(),
  deleteOrganizationWorkspace: vi.fn(),
}));

vi.mock("@/api/workspaces", () => ({
  patchWorkspaceDetail: vi.fn(),
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

describe("useUserCenterWorkspacesMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkOrganizationWorkspaceSlugAvailability).mockResolvedValue({
      normalizedSlug: "new-workspace",
      available: true,
      reason: null,
    });
    vi.mocked(createOrganizationWorkspace).mockResolvedValue({
      workspaceId: "ws-new",
      name: "New Workspace",
    } as never);
    vi.mocked(patchWorkspaceDetail).mockResolvedValue({
      id: "ws-new",
      project: { projectId: "project-new" },
      organizationId: "org-1",
      slug: "new-workspace",
      name: "New Workspace",
      description: null,
      kind: "team",
      iconMode: "initials",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
      iconUrl: null,
    });
  });

  it("invalidates card queries after creating a workspace in the global workspaces view", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(
      () =>
        useUserCenterWorkspacesMutations({
          organizationId: undefined,
          t: ((key: string) => key) as never,
          onCreateSuccess: vi.fn(),
          onArchiveSuccess: vi.fn(),
          onDeleteSuccess: vi.fn(),
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.createMutation.mutateAsync({
        name: "New Workspace",
        slug: "new-workspace",
        description: "Fresh workspace",
      });
    });

    await waitFor(() => {
      expect(checkOrganizationWorkspaceSlugAvailability).toHaveBeenCalledWith(
        undefined,
        "new-workspace",
      );
      expect(createOrganizationWorkspace).toHaveBeenCalledWith(undefined, {
        name: "New Workspace",
        slug: "new-workspace",
        description: "Fresh workspace",
        template: "blank",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["organization-workspaces-cards", "me"],
    });
  });

  it("invalidates workspace detail queries after updating workspace identity metadata", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(
      () =>
        useUserCenterWorkspacesMutations({
          organizationId: undefined,
          t: ((key: string) => key) as never,
          onCreateSuccess: vi.fn(),
          onArchiveSuccess: vi.fn(),
          onDeleteSuccess: vi.fn(),
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.updateMutation.mutateAsync({
        workspaceId: "ws-new",
        patch: {
          iconMode: "glyph",
          iconColor: "#112233",
          iconGlyph: "rocket",
          iconEmoji: null,
          iconUrl: "/assets/icon-1",
        },
      });
    });

    expect(patchWorkspaceDetail).toHaveBeenCalledWith("ws-new", {
      iconMode: "glyph",
      iconColor: "#112233",
      iconGlyph: "rocket",
      iconEmoji: null,
      iconUrl: "/assets/icon-1",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["workspace", "detail", "ws-new"],
    });
  });
});
