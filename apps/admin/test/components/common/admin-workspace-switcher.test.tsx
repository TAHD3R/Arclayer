import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MyWorkspace, MyWorkspaceListResult } from "@/types/api";
import { getWorkspaceDetail, listMyWorkspaces } from "@/api/workspaces";
import { AdminWorkspaceSwitcher } from "@/components/layout/admin-workspace-switcher";
import {
  SettingsScreenProvider,
  useSettingsScreen,
} from "@/components/layout/settings-screen-provider";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { SidebarProvider } from "@arclayer/ui/sidebar";

const navigateMock = vi.fn();
let mockPathname = "/projects/project-alpha/assets";
const translations: Record<string, string> = {
  "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE": "Select workspace",
  "common:WORKSPACE_SWITCHER_WORKSPACE_SETTINGS": "Workspace settings",
  "team:TEAM_INVITE_MEMBER": "Invite members",
  "common:WORKSPACE_SWITCHER_VIEW_ALL_PROJECTS": "View all projects",
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
    projectId: "project-alpha",
    organizationId: "org-1",
    name: "Workspace Alpha",
    kind: "team",
    iconMode: "image",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
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
  },
  {
    workspaceId: "ws-beta",
    projectId: "project-beta",
    organizationId: "org-1",
    name: "Workspace Beta",
    kind: "team",
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
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

function renderWithQueryClient(
  component: React.ReactElement,
  options: { sidebarDefaultOpen?: boolean } = {},
) {
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
        <SidebarProvider defaultOpen={options.sidebarDefaultOpen ?? true} className="h-screen">
          <SettingsScreenProvider>
            {component}
            <SettingsScreenProbe />
          </SettingsScreenProvider>
        </SidebarProvider>
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

function SettingsScreenProbe() {
  const settings = useSettingsScreen();
  return (
    <>
      <div data-testid="settings-open">{String(settings.state.open)}</div>
      <div data-testid="settings-screen">{settings.state.screen}</div>
      <div data-testid="settings-section">{settings.state.section ?? "none"}</div>
    </>
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
  mockPathname = "/projects/project-alpha/assets";

  useAuthStore.setState({ accessToken: "token", sessionVersion: 1 });
  useWorkspaceStore.setState({
    currentWorkspaceId: "ws-alpha",
    currentProjectId: "project-alpha",
    lastWorkspaceId: "ws-alpha",
    lastProjectId: "project-alpha",
  });

  vi.mocked(listMyWorkspaces).mockResolvedValue(createWorkspaceListResult());
  vi.mocked(getWorkspaceDetail).mockResolvedValue({
    id: "ws-alpha",
    project: null,
    organizationId: "org-1",
    name: "Workspace Alpha",
    kind: "team",
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
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
      project: null,
      organizationId: "org-1",
      name: "Workspace Alpha",
      kind: "team",
      iconMode: "image",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
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
      expect(avatarImage?.parentElement).toHaveClass("rounded-sm");
      expect(avatarImage?.parentElement).toHaveClass("self-center");
      expect(avatarImage?.parentElement).toHaveStyle({ width: "28px", height: "28px" });
    });
  });

  it("workspace scope: trigger avatar grows in the collapsed sidebar state", async () => {
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-alpha",
      project: null,
      organizationId: "org-1",
      name: "Workspace Alpha",
      kind: "team",
      iconMode: "image",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
      iconUrl: "https://example.com/workspace-alpha-icon.png",
    });

    renderWithQueryClient(<AdminWorkspaceSwitcher />, { sidebarDefaultOpen: false });

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });

    await waitFor(() => {
      const avatarImage = trigger.querySelector('img[alt="Workspace Alpha"]');
      expect(avatarImage?.parentElement).toHaveStyle({ width: "32px", height: "32px" });
    });
  });

  it("workspace scope: trigger renders glyph metadata when image mode is not selected", async () => {
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-alpha",
      project: null,
      organizationId: "org-1",
      name: "Workspace Alpha",
      kind: "team",
      iconMode: "glyph",
      iconColor: "#112233",
      iconGlyph: "rocket",
      iconEmoji: null,
      iconUrl: "https://example.com/workspace-alpha-icon.png",
    });

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });

    await waitFor(() => {
      const avatar = trigger.querySelector('div[aria-label="Workspace Alpha"]');
      expect(avatar).toBeTruthy();
      expect(avatar?.querySelector("svg.lucide-rocket")).toBeTruthy();
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

    expect(trigger.className).toContain("!h-9");
    expect(trigger.className).toContain("inline-flex");
    expect(trigger.className).toContain("border-transparent");
    expect(trigger.className).toContain("hover:bg-accent");
    expect(trigger.className).toContain("hover:text-accent-foreground");
    expect(trigger.className).toContain("dark:hover:bg-accent/50");
    expect(trigger.className).toContain("data-[state=open]:bg-accent");
    expect(trigger.className).toContain("data-[state=open]:text-accent-foreground");
    expect(trigger.className).toContain("dark:data-[state=open]:bg-accent/50");

    await waitFor(() => {
      const avatar = trigger.querySelector('div[aria-label="Workspace Alpha"]');
      expect(avatar).toBeTruthy();
      expect(avatar).toHaveClass("rounded-sm");
      expect(avatar).toHaveStyle({ width: "28px", height: "28px" });
    });
  });

  it("sidebar forceVisible: renders the sidebar trigger outside project routes", async () => {
    mockPathname = "/settings/personal/profile";

    renderWithQueryClient(<AdminWorkspaceSwitcher forceVisible />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });

    expect(trigger.className).toContain("group/panel-trigger");
    expect(trigger.className).toContain("!h-9");
    expect(trigger.className).toContain("rounded-md");
    expect(trigger.className).toContain("!justify-start");
    expect(trigger.className).toContain("hover:!bg-accent");
    expect(trigger.className).toContain("hover:!text-accent-foreground");
    expect(trigger.className).toContain("dark:hover:!bg-accent/50");
    expect(trigger.className).toContain("data-[state=open]:!bg-accent");
    expect(trigger.className).toContain("data-[state=open]:!text-accent-foreground");
    expect(trigger.className).toContain("dark:data-[state=open]:!bg-accent/50");
    expect(trigger.className).toContain("w-full");
    expect(trigger.className).toContain("max-w-full");
    const chevron = trigger.querySelector("svg.lucide-chevron-down");
    expect(chevron).toBeTruthy();
    expect(chevron?.getAttribute("class")).toContain("transition-transform");
    expect(chevron?.getAttribute("class")).not.toContain("origin-left");
    const chevronSlot = chevron?.parentElement;
    expect(chevronSlot?.getAttribute("class")).toContain("ml-auto");
    expect(chevronSlot?.getAttribute("class")).toContain("origin-left");
  });

  it("sidebar forceVisible: keeps the trigger shell full-width when the panel is open", async () => {
    const user = userEvent.setup();
    mockPathname = "/settings/personal/profile";

    renderWithQueryClient(<AdminWorkspaceSwitcher forceVisible />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    const shell = trigger.closest<HTMLElement>("[data-panel-open]");
    if (!shell) {
      throw new Error("Missing sidebar trigger shell");
    }

    expect(shell).toHaveAttribute("data-panel-open", "false");

    await user.click(trigger);

    expect(shell).toHaveAttribute("data-panel-open", "true");
    expect(trigger.className).toContain("w-full");
    expect(trigger.className).toContain("max-w-full");
  });

  it("sidebar forceVisible: stays full-width inside a flex floating root", async () => {
    mockPathname = "/settings/personal/profile";

    renderWithQueryClient(<AdminWorkspaceSwitcher forceVisible className="flex w-full min-w-0" />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });
    const shell = trigger.closest<HTMLElement>("[data-panel-open]")?.parentElement;
    if (!shell) {
      throw new Error("Missing sidebar trigger shell wrapper");
    }

    expect(shell.className).toContain("w-full");
    expect(shell.className).toContain("flex-1");
  });

  it("global scope: trigger uses the last selected workspace", async () => {
    mockPathname = "/projects";
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      currentProjectId: null,
      lastWorkspaceId: "ws-alpha",
      lastProjectId: "project-alpha",
    });

    renderWithQueryClient(<AdminWorkspaceSwitcher variant="header" />);

    await waitFor(() => {
      expect(screen.getByText("Workspace Alpha")).toBeInTheDocument();
    });
    expect(screen.queryByText("Select workspace")).not.toBeInTheDocument();
    expect(getWorkspaceDetail).toHaveBeenCalledWith("ws-alpha");
  });

  it("global scope: selects the only workspace when no current or last selection exists", async () => {
    mockPathname = "/projects";
    const onlyWorkspace = {
      ...workspaceFixtures[0],
      workspaceId: "ws-solo",
      projectId: "project-solo",
      name: "Solo Workspace",
    };
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      currentProjectId: null,
      lastWorkspaceId: null,
      lastProjectId: null,
    });
    vi.mocked(listMyWorkspaces).mockResolvedValue(
      createWorkspaceListResult({
        items: [onlyWorkspace],
        switcher: { teams: [onlyWorkspace] },
      }),
    );
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-solo",
      project: null,
      organizationId: "org-1",
      name: "Solo Workspace",
      kind: "team",
      iconMode: "initials",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
      iconUrl: null,
    });

    renderWithQueryClient(<AdminWorkspaceSwitcher variant="header" />);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-solo");
      expect(screen.getByText("Solo Workspace")).toBeInTheDocument();
    });
    expect(getWorkspaceDetail).toHaveBeenCalledWith("ws-solo");
  });

  it("global scope: selects the first workspace when multiple workspaces have no stored selection", async () => {
    mockPathname = "/projects";
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      currentProjectId: null,
      lastWorkspaceId: null,
      lastProjectId: null,
    });

    renderWithQueryClient(<AdminWorkspaceSwitcher variant="header" />);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-alpha");
      expect(screen.getByText("Workspace Alpha")).toBeInTheDocument();
    });
    expect(getWorkspaceDetail).toHaveBeenCalledWith("ws-alpha");
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
    expect(workspaceAlphaButton.className).toContain("hover:bg-accent");
    expect(workspaceAlphaButton.className).toContain("hover:text-accent-foreground");
    expect(workspaceAlphaButton.className).toContain("dark:hover:bg-accent/50");
    expect(workspaceAlphaButton.className).toContain("bg-accent");
    expect(workspaceAlphaButton.className).toContain("text-accent-foreground");
    expect(workspaceAlphaButton.className).toContain("dark:bg-accent/50");
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
    expect(panel.querySelector(".w-70")).toBeInTheDocument();
    const workspaceBetaButton = within(panel).getByRole("button", { name: /Workspace Beta/ });
    const settingsButton = within(panel).getByRole("button", { name: /Workspace settings/ });
    const inviteMembersButton = within(panel).getByRole("button", { name: /Invite members/ });
    const viewAllWorkspacesButton = within(panel).getByRole("button", {
      name: /View all projects/,
    });
    const addWorkspaceButton = within(panel).getByRole("button", { name: /Add workspace/ });

    expect(settingsButton).toBeInTheDocument();
    expect(settingsButton.querySelector(".lucide-square-stack")).toBeInTheDocument();
    expect(settingsButton.className).toContain("!text-callout");
    expect(inviteMembersButton).toBeInTheDocument();
    expect(inviteMembersButton.className).toContain("!text-callout");
    expect(viewAllWorkspacesButton).toBeInTheDocument();
    expect(viewAllWorkspacesButton.className).toContain("!text-callout");
    expect(addWorkspaceButton).toBeInTheDocument();
    expect(addWorkspaceButton.className).toContain("!text-callout");
    expect(
      within(panel).queryByRole("button", { name: "Open organization workspaces" }),
    ).not.toBeInTheDocument();
    expect(settingsButton.className).toContain("hover:bg-accent");
    expect(settingsButton.className).toContain("hover:text-accent-foreground");
    expect(settingsButton.className).toContain("dark:hover:bg-accent/50");

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

  it("workspace scope: action buttons open workspace settings through provider", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Select workspace",
    });

    await user.click(trigger);
    await user.click(within(getLatestDialog()).getByRole("button", { name: /Workspace settings/ }));
    await waitFor(() => {
      expect(screen.getByTestId("settings-open")).toHaveTextContent("true");
      expect(screen.getByTestId("settings-screen")).toHaveTextContent("workspace.general");
    });

    await user.click(trigger);
    await user.click(within(getLatestDialog()).getByRole("button", { name: /Invite members/ }));
    await waitFor(() => {
      expect(screen.getByTestId("settings-open")).toHaveTextContent("true");
      expect(screen.getByTestId("settings-screen")).toHaveTextContent("workspace.members");
      expect(screen.getByTestId("settings-section")).toHaveTextContent("invite-member");
    });

    await user.click(trigger);
    await user.click(within(getLatestDialog()).getByRole("button", { name: /View all projects/ }));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" });
    });

    await user.click(trigger);
    await user.click(within(getLatestDialog()).getByRole("button", { name: /Add workspace/ }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("common:ORG_WORKSPACES_CREATE_TEAM")).toBeInTheDocument();
    });
  });

  it("workspace scope: selecting a workspace switches context without navigation", async () => {
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
      expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-beta");
      expect(useWorkspaceStore.getState().currentProjectId).toBeNull();
    });
    expect(navigateMock).not.toHaveBeenCalledWith({ to: "/projects/project-beta/assets" });
  });
});
