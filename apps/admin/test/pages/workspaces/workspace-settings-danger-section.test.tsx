import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";
import { TooltipProvider } from "@arclayer/ui/tooltip";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { WorkspaceSettingsDangerSection } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-danger-section";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const navigateMock = vi.fn().mockResolvedValue(undefined);
const getWorkspaceDangerCapabilitiesMock = vi.fn();
const deleteWorkspaceMock = vi.fn();
const listMyWorkspacesMock = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDangerCapabilities: (...args: unknown[]) =>
    getWorkspaceDangerCapabilitiesMock(...args),
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
      <SettingsScreenProvider>
        <TooltipProvider>{node}</TooltipProvider>
      </SettingsScreenProvider>
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({
    currentWorkspaceId: "ws-current",
    lastWorkspaceId: "ws-current",
  });
  listMyWorkspacesMock.mockResolvedValue({
    items: [],
    instanceSetup: { status: "ready", repairReason: null },
  });
});

describe("WorkspaceSettingsDangerSection", () => {
  it("deletes workspace from the general settings danger section", async () => {
    const user = userEvent.setup();
    getWorkspaceDangerCapabilitiesMock.mockResolvedValue({
      workspaceId: "ws-1",
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
          projectId: "project-2",
          name: "Beta",
          isOwner: true,
        },
      ],
      instanceSetup: { status: "ready", repairReason: null },
    });

    renderWithProviders(<WorkspaceSettingsDangerSection workspaceId="ws-1" />);

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("settings:SETTINGS_WORKSPACE_DELETE_TITLE"),
      }),
    );
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
        to: "/projects/project-2/settings/general",
        replace: true,
      });
    });
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-2");
    expect(useWorkspaceStore.getState().currentProjectId).toBe("project-2");
  });

  it("disables delete when danger capabilities block the action", async () => {
    getWorkspaceDangerCapabilitiesMock.mockResolvedValue({
      workspaceId: "ws-1",
      confirmLeaveText: "LEAVE",
      confirmDeleteName: "Workspace Alpha",
      leaveAction: { enabled: true, blockedReason: null },
      deleteAction: { enabled: false, blockedReason: "WORKSPACE_OWNER_REQUIRED" },
    });

    renderWithProviders(<WorkspaceSettingsDangerSection workspaceId="ws-1" />);

    expect(
      await screen.findByRole("button", {
        name: i18n.t("settings:SETTINGS_WORKSPACE_DELETE_TITLE"),
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
