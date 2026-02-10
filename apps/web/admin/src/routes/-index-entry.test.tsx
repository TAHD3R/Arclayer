import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const navigateMock = vi.fn();
const invalidateQueriesMock = vi.fn();
const setCurrentWorkspaceIdMock = vi.fn();

let accessToken: string | null = "token";
let searchStr = "";

type BootstrapState = {
  ready: boolean;
  repairRequired: boolean;
  workspaceId: string | null;
};

type WorkspacesState = {
  items: Array<{ workspaceId: string; name?: string | null; slug?: string | null }>;
};

type QueryState<T> = {
  data?: T;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
};

let bootstrapQueryState: QueryState<BootstrapState>;
let workspacesQueryState: QueryState<WorkspacesState>;

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: unknown) => options,
    useNavigate: () => navigateMock,
    useRouterState: ({ select }: { select: (state: { location: { searchStr: string } }) => string }) =>
      select({ location: { searchStr } }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown }) => {
    if (Array.isArray(queryKey) && queryKey[1] === "bootstrapState") return bootstrapQueryState;
    if (Array.isArray(queryKey) && queryKey[1] === "workspaces") return workspacesQueryState;
    throw new Error(`Unexpected query key: ${JSON.stringify(queryKey)}`);
  },
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: { accessToken: string | null }) => unknown) =>
    selector({ accessToken }),
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (
    selector: (state: { setCurrentWorkspaceId: (workspaceId: string) => void }) => unknown,
  ) =>
    selector({ setCurrentWorkspaceId: setCurrentWorkspaceIdMock }),
}));

vi.mock("@/components/common/default-page", () => ({
  DefaultPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/common/page-state", () => ({
  PageState: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { WorkspaceEntryPage } from "./index";

describe("WorkspaceEntryPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    invalidateQueriesMock.mockReset();
    setCurrentWorkspaceIdMock.mockReset();

    accessToken = "token";
    searchStr = "";

    bootstrapQueryState = {
      data: {
        ready: false,
        repairRequired: false,
        workspaceId: null,
      },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: async () => undefined,
    };

    workspacesQueryState = {
      data: { items: [] },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: async () => undefined,
    };
  });

  test("redirects to /onboarding when user has no resolvable workspace", async () => {
    render(<WorkspaceEntryPage />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/onboarding", replace: true });
    });

    expect(setCurrentWorkspaceIdMock).not.toHaveBeenCalled();
  });
});
