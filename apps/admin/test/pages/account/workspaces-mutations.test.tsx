import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOrganizationWorkspacesMutations } from "@/pages/organization/workspaces/hooks/use-organization-workspaces-mutations";
import { createOrganizationWorkspace } from "@/api/organization-workspaces";

vi.mock("@/api/organization-workspaces", () => ({
  createOrganizationWorkspace: vi.fn(),
  archiveOrganizationWorkspace: vi.fn(),
  unarchiveOrganizationWorkspace: vi.fn(),
  deleteOrganizationWorkspace: vi.fn(),
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

describe("useOrganizationWorkspacesMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createOrganizationWorkspace).mockResolvedValue({
      workspaceId: "ws-new",
      name: "New Workspace",
    } as never);
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
        useOrganizationWorkspacesMutations({
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
        description: "Fresh workspace",
      });
    });

    await waitFor(() => {
      expect(createOrganizationWorkspace).toHaveBeenCalledWith(undefined, {
        name: "New Workspace",
        description: "Fresh workspace",
        template: "blank",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["organization-workspaces-cards", "me"],
    });
  });
});
