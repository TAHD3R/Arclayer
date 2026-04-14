import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MyWorkspace, MyWorkspaceListResult } from "@/types/api";
import { getWorkspaceDetail, listMyWorkspaces } from "@/api/workspaces";
import { AdminWorkspaceSwitcher } from "@/components/layout/admin-workspace-switcher";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { SidebarProvider } from "@arclayer/ui/sidebar";

const navigateMock = vi.fn();
let mockPathname = "/w/ws-alpha/assets";
const translations: Record<string, string> = {
  "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE": "Select workspace",
  "common:WORKSPACE_SWITCHER_WORKSPACE_SETTINGS": "Workspace settings",
  "team:TEAM_INVITE_MEMBER": "Invite members",
  "common:WORKSPACE_SWITCHER_VIEW_ALL_WORKSPACES": "View all workspaces",
  "common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY": "No workspaces yet",
  "common:WORKSPACE_SWITCHER_ADD_WORKSPACE": "Add workspace",
  "common:WORKSPACE_SWITCHER_ORG_SETTINGS": "Organization settings",
  "common:WORKSPACE_SWITCHER_SELECT_ORG": "Select organization",
  "common:WORKSPACE_SWITCHER_OPEN_ORG_WORKSPACES": "Open organization workspaces",
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: mockPathname } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number }) => {
      if (key === "common:ORG_WORKSPACES_MEMBERS_COUNT") {
        return `${params?.count ?? 0} ${(params?.count ?? 0) === 1 ? "member" : "members"}`;
      }
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDetail: vi.fn(),
  listMyWorkspaces: vi.fn(),
}));

const workspaceFixtures: MyWorkspace[] = [
  {
    workspaceId: "ws-alpha",
    organizationId: "org-1",
    slug: "alpha",
    name: "Workspace Alpha",
    kind: "team",
    iconUrl: "https://example.com/workspace-alpha-icon.png",
    memberCount: 3,
    membersPreview: [
      {
        userId: "user-alpha-1",
        username: "ada",
        displayName: "Ada Lovelace",
        avatarUrl: "https://example.com/ada.png",
      },
      {
        userId: "user-alpha-2",
        username: "grace",
        displayName: "Grace Hopper",
        avatarUrl: "https://example.com/grace.png",
      },
      {
        userId: "user-alpha-3",
        username: "linus",
        displayName: "Linus Torvalds",
        avatarUrl: null,
      },
    ],
    visibleOnly: false,
    isCreatorAdmin: true,
    isLegacy: false,
  },
  {
    workspaceId: "ws-beta",
    organizationId: "org-1",
    slug: "beta",
    name: "Workspace Beta",
    kind: "team",
    iconUrl: null,
    memberCount: 1,
    membersPreview: [
      {
        userId: "user-beta-1",
        username: "margaret",
        displayName: "Margaret Hamilton",
        avatarUrl: null,
      },
    ],
    visibleOnly: false,
    isCreatorAdmin: true,
    isLegacy: false,
  },
];

function createWorkspaceListResult(
  overrides: Partial<MyWorkspaceListResult> = {},
): MyWorkspaceListResult {
  return {
    items: workspaceFixtures,
    switcher: {
      teams: workspaceFixtures,
    },
    instanceSetup: {
      status: "ready",
      repairReason: null,
    },
    ...overrides,
  };
}

function renderWithQueryClient(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ChromeTabsProvider
        labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
      >
        <SidebarProvider defaultOpen className="h-screen">
          {component}
        </SidebarProvider>
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

function getLatestDialog(): HTMLElement {
  const dialogs = screen.getAllByRole("dialog");
  const latest = dialogs[dialogs.length - 1];
  if (!latest) {
    throw new Error("No dialog found");
  }
  return latest;
}

beforeAll(() => {
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

  class ResizeObserverMock {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname = "/w/ws-alpha/assets";

  useAuthStore.setState({ accessToken: "token", sessionVersion: 1 });
  useWorkspaceStore.setState({ currentWorkspaceId: "ws-alpha", lastWorkspaceId: "ws-alpha" });

  vi.mocked(listMyWorkspaces).mockResolvedValue(createWorkspaceListResult());
  vi.mocked(getWorkspaceDetail).mockResolvedValue({
    id: "ws-alpha",
    organizationId: "org-1",
    slug: "alpha",
    name: "Workspace Alpha",
    kind: "team",
    iconUrl: null,
  });
});

describe("AdminWorkspaceSwitcher (workspace-only)", () => {
  it("workspace scope: trigger shows current workspace name", async () => {
    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    await waitFor(() => {
      expect(screen.getByText(/Workspace Alpha/)).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", {
      name: "Select workspace",
    });
    expect(trigger).not.toHaveAttribute("title");
  });

  it("workspace scope: trigger does not render a browser tooltip on hover", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    await screen.findByText("Workspace Alpha");

    await user.hover(trigger);
    await waitFor(() => {
      const tooltip = document.querySelector('[data-slot="tooltip-content"]');
      expect(tooltip).toBeNull();
    });
  });

  it("workspace scope: trigger avatar uses square shape and workspace icon", async () => {
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-alpha",
      organizationId: "org-1",
      slug: "alpha",
      name: "Workspace Alpha",
      kind: "team",
      iconUrl: "https://example.com/workspace-alpha-icon.png",
    });

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });

    await waitFor(() => {
      const avatarImage = trigger.querySelector('img[alt="Workspace Alpha"]');
      expect(avatarImage).toBeTruthy();
      expect(avatarImage).toHaveAttribute("src", "https://example.com/workspace-alpha-icon.png");
      expect(avatarImage?.parentElement).toHaveClass("rounded-md");
    });
  });

  it("workspace scope: forwards className to floating root container", async () => {
    renderWithQueryClient(<AdminWorkspaceSwitcher className="test-switcher-root" />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });

    const root = document.querySelector(".test-switcher-root");
    expect(root).toBeInTheDocument();
    expect(root).toHaveClass("relative");
    expect(root?.contains(trigger)).toBe(true);
  });

  it("header variant: uses compact trigger chrome for constrained header space", async () => {
    renderWithQueryClient(<AdminWorkspaceSwitcher variant="header" />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });

    expect(trigger.className).toContain("!h-10");
    expect(trigger.className).toContain("inline-flex");
    expect(trigger.className).toContain("border-transparent");

    await waitFor(() => {
      const avatar = trigger.querySelector('div[aria-label="Workspace Alpha"]');
      expect(avatar).toBeTruthy();
      expect(avatar).toHaveClass("rounded-md");
      expect(avatar).toHaveStyle({ width: "28px", height: "28px" });
    });
  });

  it("workspace scope: opening panel shows team workspaces only", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    await user.click(trigger);

    const panel = getLatestDialog();

    expect(within(panel).getByRole("button", { name: /Workspace Alpha/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Workspace Beta/ })).toBeInTheDocument();
    expect(within(panel).queryByText("Team spaces")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Org Alpha/ })).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: "Organization settings" }),
    ).not.toBeInTheDocument();
  });

  it("workspace scope: panel omits any organization picker affordance", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    await user.click(trigger);

    const panel = getLatestDialog();

    expect(within(panel).queryByText("Select organization")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Org Alpha/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Workspace Alpha/ })).toBeInTheDocument();
  });

  it("workspace scope: workspace rows show member avatars and counts", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    const workspaceAlphaButton = within(panel).getByRole("button", {
      name: /Workspace Alpha/,
    });
    expect(within(workspaceAlphaButton).getByText("3 members")).toBeInTheDocument();
    expect(within(workspaceAlphaButton).getByAltText("Ada Lovelace")).toBeInTheDocument();
    expect(within(workspaceAlphaButton).getByAltText("Grace Hopper")).toBeInTheDocument();
    expect(within(workspaceAlphaButton).getByLabelText("Linus Torvalds")).toBeInTheDocument();
  });

  it("workspace scope: short workspace lists do not reserve a scroll gutter", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    const workspaceAlphaButton = within(panel).getByRole("button", {
      name: /Workspace Alpha/,
    });
    const workspaceList = workspaceAlphaButton.parentElement;

    expect(workspaceList).toBeTruthy();
    expect(workspaceList).not.toHaveClass("overflow-y-auto");
    expect(workspaceList).not.toHaveClass("overscroll-contain");
  });

  it("workspace scope: long workspace lists keep the scroll container", async () => {
    const user = userEvent.setup();
    const extendedWorkspaces = Array.from({ length: 6 }, (_, index) => ({
      ...workspaceFixtures[index % workspaceFixtures.length],
      workspaceId: `ws-${index + 1}`,
      slug: `workspace-${index + 1}`,
      name: `Workspace ${index + 1}`,
    }));

    vi.mocked(listMyWorkspaces).mockResolvedValue(
      createWorkspaceListResult({
        items: extendedWorkspaces,
        switcher: {
          teams: extendedWorkspaces,
        },
      }),
    );

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    const workspaceButton = within(panel).getByRole("button", {
      name: /Workspace 1/,
    });
    const workspaceList = workspaceButton.parentElement;

    expect(workspaceList).toBeTruthy();
    expect(workspaceList).toHaveClass("overflow-y-auto");
    expect(workspaceList).toHaveClass("overscroll-contain");
  });

  it("workspace scope: action groups expose settings, invites, workspaces index, and add workspace", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    const workspaceBetaButton = within(panel).getByRole("button", { name: /Workspace Beta/ });
    const settingsButton = within(panel).getByRole("button", { name: /Workspace settings/ });
    const inviteMembersButton = within(panel).getByRole("button", { name: /Invite members/ });
    const viewAllWorkspacesButton = within(panel).getByRole("button", {
      name: /View all workspaces/,
    });
    const addWorkspaceButton = within(panel).getByRole("button", { name: /Add workspace/ });

    expect(settingsButton).toBeInTheDocument();
    expect(inviteMembersButton).toBeInTheDocument();
    expect(viewAllWorkspacesButton).toBeInTheDocument();
    expect(addWorkspaceButton).toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: "Open organization workspaces" }),
    ).not.toBeInTheDocument();

    const buttons = within(panel).getAllByRole("button");
    expect(buttons.indexOf(settingsButton)).toBeGreaterThan(buttons.indexOf(workspaceBetaButton));
    expect(buttons.indexOf(inviteMembersButton)).toBeGreaterThan(buttons.indexOf(settingsButton));
    expect(buttons.indexOf(viewAllWorkspacesButton)).toBeGreaterThan(
      buttons.indexOf(inviteMembersButton),
    );
    expect(buttons.indexOf(addWorkspaceButton)).toBeGreaterThan(
      buttons.indexOf(viewAllWorkspacesButton),
    );
  });

  it("workspace scope: action buttons navigate to workspace and account destinations", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });

    await user.click(trigger);
    await user.click(within(getLatestDialog()).getByRole("button", { name: /Workspace settings/ }));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-alpha/settings/workspace/" });
    });

    await user.click(trigger);
    await user.click(within(getLatestDialog()).getByRole("button", { name: /Invite members/ }));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-alpha/team/members/" });
    });

    await user.click(trigger);
    await user.click(
      within(getLatestDialog()).getByRole("button", { name: /View all workspaces/ }),
    );
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/workspaces" });
    });

    await user.click(trigger);
    await user.click(within(getLatestDialog()).getByRole("button", { name: /Add workspace/ }));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/workspaces?create=1" });
    });
  });

  it("workspace scope: selecting a workspace navigates and updates store", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    const workspaceBetaButton = await within(panel).findByRole("button", {
      name: /Workspace Beta/,
    });
    await user.click(workspaceBetaButton);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-beta/assets" });
    });
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-beta");
  });
});
