import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkProjectSlugAvailability, createProject } from "@/api/projects";
import { useUserCenterProjectsMutations } from "@/pages/usercenter/projects/hooks/use-usercenter-projects-mutations";

vi.mock("@/api/projects", () => ({
  archiveProject: vi.fn(),
  checkProjectSlugAvailability: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectDangerCapabilities: vi.fn(),
  patchProject: vi.fn(),
  unarchiveProject: vi.fn(),
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

describe("useUserCenterProjectsMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkProjectSlugAvailability).mockResolvedValue({
      normalizedSlug: "project-alpha",
      available: true,
      reason: null,
    });
    vi.mocked(createProject).mockResolvedValue({
      id: "project-1",
      projectId: "project-1",
      workspaceId: "ws-1",
      organizationId: "org-1",
      slug: "project-alpha",
      name: "Project Alpha",
      description: null,
      iconMode: "initials",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
      iconUrl: null,
      isActive: true,
      primaryRuntime: null,
      memberCount: 1,
      membersPreview: [],
      archivedAt: null,
      archivedByUserId: null,
      createdAt: "2026-04-19T00:00:00Z",
      enterable: true,
    });
  });

  it("invalidates table, card, and global nav project queries after create", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(
      () =>
        useUserCenterProjectsMutations({
          workspaceId: "ws-1",
          t: ((key: string) => key) as never,
          onCreateSuccess: vi.fn(),
          onArchiveSuccess: vi.fn(),
          onDeleteSuccess: vi.fn(),
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.createMutation.mutateAsync({
        workspaceId: "ws-1",
        name: "Project Alpha",
        slug: "project-alpha",
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["dataTable", "projects-active:workspace:ws-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["dataTable", "projects-archived:workspace:ws-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["projects-cards"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["global-nav", "projects"],
    });
  });
});
