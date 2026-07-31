import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAcceptInvite } from "@/pages/invitations/hooks/use-accept-invite";

const { navigateMock, previewInvitationMock, authState, workspaceState } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  previewInvitationMock: vi.fn(),
  authState: {
    accessToken: null as string | null,
    clear: vi.fn(),
  },
  workspaceState: {
    setCurrentWorkspaceId: vi.fn(),
    setCurrentProjectId: vi.fn(),
    clearWorkspace: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/api/auth", () => ({
  me: vi.fn(),
}));

vi.mock("@/api/invitations", () => ({
  previewInvitation: (...args: unknown[]) => previewInvitationMock(...args),
  acceptExistingInvitation: vi.fn(),
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  getErrorMessage: (error: unknown) => String(error),
  notifyError: vi.fn(),
  notifyErrorText: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof workspaceState) => unknown) =>
    selector(workspaceState),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  navigateMock.mockReset();
  previewInvitationMock.mockReset();
  authState.accessToken = null;
});

describe("useAcceptInvite guest routing", () => {
  it("presents the server-projected no-role invitation as Fixed Member access", async () => {
    previewInvitationMock.mockResolvedValue({
      invitation: {
        email: "invited@example.com",
        roleCode: null,
        expiresAt: null,
      },
      workspace: { id: "workspace-invite", name: "Invite workspace" },
      role: null,
      inviter: null,
      userExists: true,
    });
    const { result } = renderHook(() => useAcceptInvite("invite-token"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.previewQuery.data).toBeDefined());

    expect(result.current.roleResolved).toEqual({
      name: "team:TEAM_MEMBER_FIXED_ACCESS",
      description: "team:TEAM_MEMBER_FIXED_ACCESS_DESC",
    });
  });

  it.each([
    { userExists: true, expectedMode: "login" },
    { userExists: false, expectedMode: "register" },
  ])("routes a guest to unified $expectedMode with invite context", async (scenario) => {
    previewInvitationMock.mockResolvedValue({
      invitation: {
        email: "invited@example.com",
        roleCode: "editor",
        expiresAt: null,
      },
      workspace: { id: "workspace-invite", name: "Invite workspace" },
      role: null,
      inviter: null,
      userExists: scenario.userExists,
    });
    const { result } = renderHook(() => useAcceptInvite("invite-token"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.previewQuery.data).toBeDefined());
    await act(async () => {
      await result.current.onContinue();
    });

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/login",
      search: {
        redirect: "/invitations?token=invite-token",
        invite: "invite-token",
        mode: scenario.expectedMode,
      },
      replace: true,
    });
  });
});
