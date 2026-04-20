import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { TooltipProvider } from "@arclayer/ui/tooltip";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { WorkspaceSettingsDangerView } from "@/pages/workspaces/settings/workspace/danger/components/workspace-settings-danger-view";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const navigateMock = vi.fn().mockResolvedValue(undefined);
let mockPathname = "/";
const getWorkspaceDangerCapabilitiesMock = vi.fn();
const leaveWorkspaceMock = vi.fn();
const deleteWorkspaceMock = vi.fn();
const listMyWorkspacesMock = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string; searchStr: string } }) => unknown;
    }) => select({ location: { pathname: mockPathname, searchStr: "" } }),
  };
});

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDangerCapabilities: (...args: unknown[]) =>
    getWorkspaceDangerCapabilitiesMock(...args),
  leaveWorkspace: (...args: unknown[]) => leaveWorkspaceMock(...args),
  deleteWorkspace: (...args: unknown[]) => deleteWorkspaceMock(...args),
  listMyWorkspaces: (...args: unknown[]) => listMyWorkspacesMock(...args),
}));

function renderWithProviders(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ChromeTabsProvider
        labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
      >
        <TooltipProvider>{node}</TooltipProvider>
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  await initI18n(DEFAULT_LOCALE);
});

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    keepSession: true,
    sessionVersion: 1,
    accessToken: "token",
    refreshToken: "refresh",
    tokenType: "bearer",
    expiresIn: 3600,
    refreshExpiresIn: 86400,
  });
  useWorkspaceStore.setState({
    currentWorkspaceId: "ws-current",
    lastWorkspaceId: "ws-current",
  });
  listMyWorkspacesMock.mockResolvedValue({
    items: [],
    switcher: {
      teams: [],
    },
    instanceSetup: { status: "ready", repairReason: null },
  });
  mockPathname = "/";
});

describe("workspace destructive flows", () => {
  it("uses workspace capability instead of org-owner status for delete", async () => {
    const user = userEvent.setup();
    mockPathname = "/w/ws-1/settings/workspace/danger";
    mockPathname = "/w/ws-1/settings/workspace/danger";
    getWorkspaceDangerCapabilitiesMock.mockResolvedValue({
      workspaceId: "ws-1",
      organizationId: "org-1",
      confirmLeaveText: "LEAVE",
      confirmDeleteName: "Workspace Alpha",
      leaveAction: { enabled: true, blockedReason: null },
      deleteAction: { enabled: true, blockedReason: null },
    });
    deleteWorkspaceMock.mockResolvedValue({ workspaceId: "ws-1", deleted: true });
    listMyWorkspacesMock.mockResolvedValue({
      items: [
        {
          workspaceId: "ws-2",
          organizationId: "org-2",
          slug: "beta",
          name: "Beta",
          kind: "team",
          visibleOnly: false,
          isCreatorAdmin: true,
        },
      ],
      switcher: {
        teams: [
          {
            workspaceId: "ws-2",
            organizationId: "org-2",
            slug: "beta",
            name: "Beta",
            kind: "team",
            visibleOnly: false,
            isCreatorAdmin: true,
          },
        ],
      },
      instanceSetup: { status: "ready", repairReason: null },
    });

    renderWithProviders(<WorkspaceSettingsDangerView workspaceId="ws-1" />);

    const deleteButton = await screen.findByRole("button", {
      name: new RegExp(i18n.t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")),
    });
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);
    await user.type(
      await screen.findByPlaceholderText(
        i18n.t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_PLACEHOLDER"),
      ),
      "Workspace Alpha",
    );
    await user.click(screen.getByRole("button", { name: i18n.t("common:DELETE") }));

    await waitFor(() => {
      expect(deleteWorkspaceMock).toHaveBeenCalledWith("ws-1", "Workspace Alpha");
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/settings/workspace/general",
        replace: true,
      });
    });
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-2");
  });

  it("shows explicit last-active-workspace block before delete click", async () => {
    const user = userEvent.setup();
    getWorkspaceDangerCapabilitiesMock.mockResolvedValue({
      workspaceId: "ws-1",
      organizationId: "org-1",
      confirmLeaveText: "LEAVE",
      confirmDeleteName: "Workspace Alpha",
      leaveAction: { enabled: true, blockedReason: null },
      deleteAction: { enabled: false, blockedReason: "LAST_ACTIVE_WORKSPACE_NOT_DELETABLE" },
    });

    renderWithProviders(<WorkspaceSettingsDangerView workspaceId="ws-1" />);

    const deleteButton = await screen.findByRole("button", {
      name: new RegExp(i18n.t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")),
    });

    expect(deleteButton).toHaveAttribute("aria-disabled", "true");
    await user.click(deleteButton);
    expect(deleteWorkspaceMock).not.toHaveBeenCalled();
  });
});
