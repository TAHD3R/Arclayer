import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  MyWorkspace,
  MyWorkspaceListResult,
  PageData,
  ProjectListItem,
} from "@arclayer/openapi/admin-types";
import { getProjectDetail, listProjects } from "@/api/projects";
import { getWorkspaceDetail, listMyWorkspaces } from "@/api/workspaces";
import { AdminScopeSwitcher } from "@/components/layout/admin-scope-switcher";
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
  "account:ACCOUNT_MENU_WORKSPACE_SETTINGS": "Workspace Settings",
  "common:WORKSPACE_SWITCHER_ADD_WORKSPACE": "New workspace",
  "common:WORKSPACE_SWITCHER_BACK": "Back",
  "common:WORKSPACE_SWITCHER_BILLING_USAGE": "Billing & Usage",
  "common:WORKSPACE_SWITCHER_NEW_PROJECT": "New project",
  "common:WORKSPACE_SWITCHER_PROJECT_EMPTY": "No projects available",
  "common:WORKSPACE_SWITCHER_PROJECT_SEARCH_PLACEHOLDER": "Search projects",
  "common:WORKSPACE_SWITCHER_PROJECT_SECTION": "Project",
  "common:WORKSPACE_SWITCHER_PROJECT_SETTINGS": "Project Settings",
  "common:WORKSPACE_SWITCHER_SELECT_PROJECT": "Select project",
  "common:WORKSPACE_SWITCHER_SELECT_SCOPE": "Select scope",
  "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE": "Select workspace",
  "common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY": "No workspaces available",
  "common:WORKSPACE_SWITCHER_WORKSPACE_SEARCH_PLACEHOLDER": "Search workspaces",
  "common:WORKSPACE_SWITCHER_WORKSPACE_SECTION": "Workspace",
  "team:TEAM_INVITE_MEMBER": "Invite members",
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

vi.mock("@/api/projects", () => ({
  archiveProject: vi.fn(),
  checkProjectSlugAvailability: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectDetail: vi.fn(),
  listProjects: vi.fn(),
  patchProject: vi.fn(),
  unarchiveProject: vi.fn(),
}));

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDetail: vi.fn(),
  listMyWorkspaces: vi.fn(),
  patchWorkspaceDetail: vi.fn(),
}));

const workspaceFixtures: MyWorkspace[] = [
  {
    workspaceId: "ws-alpha",
    projectId: "project-alpha",
    organizationId: "org-1",
    name: "Workspace Alpha",
    kind: "team",
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
    memberCount: 3,
    membersPreview: [],
    visibleOnly: false,
    isCreatorAdmin: true,
  },
  {
    workspaceId: "ws-beta",
    projectId: "project-gamma",
    organizationId: "org-1",
    name: "Workspace Beta",
    kind: "team",
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
    memberCount: 1,
    membersPreview: [],
    visibleOnly: false,
    isCreatorAdmin: true,
  },
];

const projectFixtures: ProjectListItem[] = [
  {
    id: "project-alpha",
    workspaceId: "ws-alpha",
    organizationId: "org-1",
    slug: "alpha",
    name: "Project Alpha",
    description: "Primary project",
    iconMode: "emoji",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: "A",
    iconUrl: null,
    isActive: true,
    archivedAt: null,
    archivedByUserId: null,
    memberCount: 2,
    membersPreview: [],
    createdAt: "2026-01-01T00:00:00Z",
    enterable: true,
    primaryRuntime: null,
  } as ProjectListItem,
  {
    id: "project-beta",
    workspaceId: "ws-alpha",
    organizationId: "org-1",
    slug: "beta",
    name: "Project Beta",
    description: "Secondary project",
    iconMode: "glyph",
    iconColor: "#337ea9",
    iconGlyph: "rocket",
    iconEmoji: null,
    iconUrl: null,
    isActive: true,
    archivedAt: null,
    archivedByUserId: null,
    memberCount: 1,
    membersPreview: [],
    createdAt: "2026-01-02T00:00:00Z",
    enterable: true,
    primaryRuntime: null,
  } as ProjectListItem,
];

function createWorkspaceListResult(): MyWorkspaceListResult {
  return {
    items: workspaceFixtures,
    switcher: {
      teams: workspaceFixtures,
    },
    instanceSetup: {
      status: "ready",
      repairReason: null,
    },
  };
}

function createProjectPage(items: readonly ProjectListItem[]): PageData<ProjectListItem> {
  return {
    items: [...items],
    total: items.length,
    page: 1,
    size: 100,
    pages: 1,
    next: null,
    prev: null,
  };
}

function renderWithQueryClient(component: React.ReactElement) {
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
        <SidebarProvider defaultOpen className="h-screen">
          <SettingsScreenProvider>{component}</SettingsScreenProvider>
        </SidebarProvider>
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

function getLatestDialog(): HTMLElement {
  const dialogs = screen.getAllByRole("dialog");
  const latest = dialogs[dialogs.length - 1];
  if (!latest) throw new Error("No dialog found");
  return latest;
}

function SettingsScreenProbe() {
  const settings = useSettingsScreen();
  return (
    <output
      data-testid="settings-screen-state"
      data-open={String(settings.state.open)}
      data-section={settings.state.section ?? ""}
    >
      {settings.state.screen}
    </output>
  );
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
  vi.mocked(listProjects).mockResolvedValue(createProjectPage(projectFixtures));
  vi.mocked(getProjectDetail).mockResolvedValue({
    primaryRuntime: null,
    project: projectFixtures[0],
  } as Awaited<ReturnType<typeof getProjectDetail>>);
});

describe("AdminScopeSwitcher", () => {
  it("shows workspace identity on global routes", async () => {
    mockPathname = "/projects";

    renderWithQueryClient(<AdminScopeSwitcher variant="header" />);

    const trigger = await screen.findByRole("button", { name: "Select scope" });

    await waitFor(() => {
      expect(within(trigger).getByText("Workspace Alpha")).toBeInTheDocument();
    });
    expect(within(trigger).queryByText("Project Alpha")).toBeNull();
  });

  it("shows project identity on concrete project routes", async () => {
    renderWithQueryClient(<AdminScopeSwitcher />);

    const trigger = await screen.findByRole("button", { name: "Select scope" });

    await waitFor(() => {
      expect(within(trigger).getByText("Project Alpha")).toBeInTheDocument();
    });
    expect(within(trigger).queryByText("Workspace Alpha")).toBeNull();
  });

  it("opens the merged scope panel with project and workspace sections", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AdminScopeSwitcher />);

    await user.click(await screen.findByRole("button", { name: "Select scope" }));

    const panel = getLatestDialog();
    expect(within(panel).getByText("Project")).toBeInTheDocument();
    expect(within(panel).getByText("Workspace")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Project Alpha/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Workspace Alpha/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Project Settings" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Workspace Settings" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Billing & Usage" })).toHaveClass(
      "pointer-events-none",
    );
    expect(within(panel).getByRole("button", { name: /Invite members/ })).not.toHaveClass(
      "pointer-events-none",
    );
    expect(within(panel).getAllByRole("button", { name: /Invite members/ })).toHaveLength(1);
  });

  it("uses route project detail for the panel project when the active project is not listed yet", async () => {
    const user = userEvent.setup();
    vi.mocked(listProjects).mockResolvedValue(createProjectPage([]));

    renderWithQueryClient(<AdminScopeSwitcher />);

    const trigger = await screen.findByRole("button", { name: "Select scope" });
    await waitFor(() => {
      expect(within(trigger).getByText("Project Alpha")).toBeInTheDocument();
    });

    await user.click(trigger);

    const panel = getLatestDialog();
    expect(within(panel).getByRole("button", { name: /Project Alpha/ })).toBeInTheDocument();
    const settingsButton = within(panel).getByRole("button", { name: "Project Settings" });
    expect(settingsButton).not.toHaveClass("pointer-events-none");

    await user.click(settingsButton);

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/project-alpha/settings/general/",
    });
  });

  it("opens the existing workspace invite flow from the project section", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(
      <>
        <AdminScopeSwitcher />
        <SettingsScreenProbe />
      </>,
    );

    await user.click(await screen.findByRole("button", { name: "Select scope" }));
    const panel = getLatestDialog();
    await user.click(within(panel).getByRole("button", { name: /Invite members/ }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByTestId("settings-screen-state")).toHaveTextContent("workspace.members");
    });
    expect(screen.getByTestId("settings-screen-state")).toHaveAttribute(
      "data-section",
      "invite-member",
    );
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-alpha");
  });

  it("filters project choices locally and selects a project inside the active workspace", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AdminScopeSwitcher />);

    await user.click(await screen.findByRole("button", { name: "Select scope" }));
    let panel = getLatestDialog();
    await user.click(within(panel).getByRole("button", { name: /Project Alpha/ }));

    await user.type(screen.getByPlaceholderText("Search projects"), "Beta");

    const projectPickerPanel = getLatestDialog();
    expect(within(projectPickerPanel).queryByRole("button", { name: /Project Alpha/ })).toBeNull();
    const betaButton = within(projectPickerPanel).getByRole("button", { name: /Project Beta/ });
    await user.click(betaButton);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-alpha");
      expect(useWorkspaceStore.getState().currentProjectId).toBe("project-beta");
    });
    expect(navigateMock).toHaveBeenCalledWith({ to: "/projects/project-beta" });
    expect(listProjects).toHaveBeenCalledWith({
      workspaceId: "ws-alpha",
      archived: false,
      page: 1,
      size: 100,
    });
  });

  it("selecting a workspace clears project state and lands on the projects page", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AdminScopeSwitcher />);

    await user.click(await screen.findByRole("button", { name: "Select scope" }));
    let panel = getLatestDialog();
    await user.click(within(panel).getByRole("button", { name: /Workspace Alpha/ }));

    const betaButton = screen.getByRole("button", { name: /Workspace Beta/ });
    await user.click(betaButton);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-beta");
      expect(useWorkspaceStore.getState().currentProjectId).toBeNull();
    });
    expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" });
  });
});
