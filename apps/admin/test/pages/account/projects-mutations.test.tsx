import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { archiveProject } from "@/api/projects";
import { useUserCenterProjectsMutations } from "@/pages/usercenter/projects/hooks/use-usercenter-projects-mutations";

vi.mock("@/api/projects", () => ({
  archiveProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectDangerCapabilities: vi.fn(),
  patchProject: vi.fn(),
  unarchiveProject: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
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
    vi.mocked(archiveProject).mockResolvedValue({
      projectId: "project-1",
      isActive: false,
    });
  });

  it("invalidates table, card, and global nav project queries after archive", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);
    const onArchiveSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useUserCenterProjectsMutations({
          workspaceId: "ws-1",
          t: ((key: string) => key) as never,
          onArchiveSuccess,
          onDeleteSuccess: vi.fn(),
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.archiveMutation.mutateAsync("project-1");
    });

    expect(onArchiveSuccess).toHaveBeenCalledTimes(1);
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
