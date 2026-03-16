import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MyOrganization, MyOrganizationListResult, OrganizationWorkspace } from "@/types/api";
import { listMyOrganizations } from "@/api/me";
import { listOrganizationWorkspaces } from "@/api/organization-workspaces";
import { getWorkspaceDetail } from "@/api/workspaces";
import { AdminWorkspaceSwitcher } from "@/components/layout/admin-workspace-switcher";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { ChromeTabsProvider } from "@celestial/ui/chrome-tabs";
import { SidebarProvider } from "@celestial/ui/sidebar";

const navigateMock = vi.fn();
let mockPathname = "/w/ws-alpha/assets";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: mockPathname } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, _params?: unknown) => key,
  }),
}));

vi.mock("@/api/me", () => ({
  listMyOrganizations: vi.fn(),
}));

vi.mock("@/api/organization-workspaces", () => ({
  listOrganizationWorkspaces: vi.fn(),
}));

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDetail: vi.fn(),
}));

const organizationFixture: MyOrganization = {
  organization: {
    id: "org-1",
    name: "Org Alpha",
    slug: "org-alpha",
    logoUrl: null,
  },
  membership: {
    id: "membership-1",
    organizationId: "org-1",
    role: "owner",
    status: "active",
  },
  memberCount: 3,
  membersPreview: [
    {
      userId: "user-1",
      username: "alpha",
      displayName: "Alpha",
      avatarUrl: null,
    },
  ],
};

const organizationFixtureBeta: MyOrganization = {
  organization: {
    id: "org-2",
    name: "Org Beta",
    slug: "org-beta",
    logoUrl: null,
  },
  membership: {
    id: "membership-2",
    organizationId: "org-2",
    role: "admin",
    status: "active",
  },
  memberCount: 2,
  membersPreview: [
    {
      userId: "user-2",
      username: "beta",
      displayName: "Beta",
      avatarUrl: null,
    },
  ],
};

const organizationsFixture: MyOrganizationListResult = {
  items: [organizationFixture, organizationFixtureBeta],
  total: 2,
};

const workspaceFixturesOrg1: OrganizationWorkspace[] = [
  {
    id: "workspace-link-1",
    workspaceId: "ws-alpha",
    organizationId: "org-1",
    slug: "alpha",
    name: "Workspace Alpha",
    description: "Alpha description",
    iconUrl: null,
    isArchived: false,
    archivedAt: null,
    archivedByUserId: null,
    memberCount: 3,
    membersPreview: [],
    createdAt: "2026-01-01T00:00:00Z",
    enterable: true,
  },
  {
    id: "workspace-link-2",
    workspaceId: "ws-beta",
    organizationId: "org-1",
    slug: "beta",
    name: "Workspace Beta",
    description: "Beta description",
    iconUrl: null,
    isArchived: false,
    archivedAt: null,
    archivedByUserId: null,
    memberCount: 2,
    membersPreview: [],
    createdAt: "2026-01-02T00:00:00Z",
    enterable: true,
  },
];

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

  vi.mocked(listMyOrganizations).mockResolvedValue(organizationsFixture);
  vi.mocked(listOrganizationWorkspaces).mockImplementation(async (params) => {
    const items = params.organizationId === "org-1" ? workspaceFixturesOrg1 : [];
    return {
      items,
      total: items.length,
      page: params.page ?? 1,
      size: params.size ?? 20,
      pages: 1,
      next: null,
      prev: null,
    };
  });
  vi.mocked(getWorkspaceDetail).mockResolvedValue({
    id: "ws-alpha",
    organizationId: "org-1",
    slug: "alpha",
    name: "Workspace Alpha",
    iconUrl: null,
  });
});

describe("AdminWorkspaceSwitcher (merged org + workspace)", () => {
  it("workspace scope: trigger shows current workspace name", async () => {
    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    await waitFor(() => {
      expect(screen.getByText(/Workspace Alpha/)).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });
    expect(trigger).not.toHaveAttribute("title");
  });

  it("workspace scope: trigger does not render a browser tooltip on hover", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });
    await screen.findByText("Workspace Alpha");

    await user.hover(trigger);
    await waitFor(() => {
      const tooltip = document.querySelector('[data-slot="tooltip-content"]');
      expect(tooltip).toBeNull();
    });
  });

  it("workspace scope: trigger avatar uses square shape and organization logo", async () => {
    vi.mocked(listMyOrganizations).mockResolvedValue({
      items: [
        {
          ...organizationFixture,
          organization: {
            ...organizationFixture.organization,
            logoUrl: "https://example.com/org-alpha-logo.png",
          },
        },
        organizationFixtureBeta,
      ],
      total: 2,
    });

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });

    await waitFor(() => {
      const avatarImage = trigger.querySelector('img[alt="Workspace Alpha"]');
      expect(avatarImage).toBeTruthy();
      expect(avatarImage).toHaveAttribute("src", "https://example.com/org-alpha-logo.png");
      expect(avatarImage?.parentElement).toHaveClass("rounded-md");
    });
  });

  it("workspace scope: forwards className to floating root container", async () => {
    renderWithQueryClient(<AdminWorkspaceSwitcher className="test-switcher-root" />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });

    const root = document.querySelector(".test-switcher-root");
    expect(root).toBeInTheDocument();
    expect(root).toHaveClass("relative");
    expect(root?.contains(trigger)).toBe(true);
  });

  it("header variant: uses compact trigger chrome for constrained header space", async () => {
    renderWithQueryClient(<AdminWorkspaceSwitcher variant="header" />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });

    expect(trigger.className).toContain("!h-11");
    expect(trigger.className).toContain("border-transparent");

    await waitFor(() => {
      const avatar = trigger.querySelector('div[aria-label="Workspace Alpha"]');
      expect(avatar).toBeTruthy();
      expect(avatar).toHaveClass("rounded-md");
      expect(avatar).toHaveStyle({ width: "28px", height: "28px" });
    });
  });

  it("workspace scope: opening panel shows organizations + workspaces", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });
    await user.click(trigger);

    const panel = getLatestDialog();

    // Check organizations (accessible name includes avatar initials)
    expect(await within(panel).findByRole("button", { name: /Org Alpha/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Org Beta/ })).toBeInTheDocument();

    // Check workspaces (accessible name includes avatar initials)
    expect(within(panel).getByRole("button", { name: /Workspace Alpha/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Workspace Beta/ })).toBeInTheDocument();

    // Header actions should be Organization Settings | Members
    const orgSettingsButton = within(panel).getByRole("button", {
      name: "common:WORKSPACE_SWITCHER_ORG_SETTINGS",
    });
    const membersButton = within(panel).getByRole("button", { name: "nav:NAV_ORG_MEMBERS" });
    expect(orgSettingsButton).toBeInTheDocument();
    expect(membersButton).toBeInTheDocument();
    expect(orgSettingsButton.className).toContain("font-medium");
    expect(membersButton.className).toContain("font-medium");
    expect(orgSettingsButton.className).toContain("hover:bg-accent");
    expect(membersButton.className).toContain("hover:bg-accent");
    expect(
      within(panel).queryByRole("button", { name: "common:ORG_MEMBERS_INVITE" }),
    ).not.toBeInTheDocument();
  });

  it("workspace scope: hides organization picker when user belongs to only one organization", async () => {
    const user = userEvent.setup();
    vi.mocked(listMyOrganizations).mockResolvedValue({
      items: [organizationFixture],
      total: 1,
    });

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });
    await user.click(trigger);

    const panel = getLatestDialog();

    expect(
      within(panel).queryByText("common:WORKSPACE_SWITCHER_SELECT_ORG"),
    ).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Org Alpha/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Workspace Alpha/ })).toBeInTheDocument();
  });

  it("workspace scope: create workspace appears as the last item in workspace section", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    const createWorkspaceButton = within(panel).getByRole("button", {
      name: "common:WORKSPACE_SWITCHER_CREATE",
    });
    const workspaceBetaButton = within(panel).getByRole("button", { name: /Workspace Beta/ });

    expect(createWorkspaceButton.querySelector("svg")).toBeTruthy();
    expect(createWorkspaceButton.className).toContain("group");
    expect(createWorkspaceButton.className).toContain("transition-colors");
    expect(createWorkspaceButton.className).toContain("hover:bg-accent");
    expect(createWorkspaceButton.querySelector("span.block.w-full.min-w-0.truncate")).toBeTruthy();
    expect(
      within(panel).queryByRole("button", {
        name: "common:WORKSPACE_SWITCHER_OPEN_ORG_WORKSPACES",
      }),
    ).not.toBeInTheDocument();

    const buttons = within(panel).getAllByRole("button");
    expect(buttons.indexOf(createWorkspaceButton)).toBeGreaterThan(
      buttons.indexOf(workspaceBetaButton),
    );
  });

  it("workspace scope: bottom actions include explore organization overview and navigate to org home", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    const exploreOverviewButton = within(panel).getByRole("button", {
      name: "common:WORKSPACE_SWITCHER_EXPLORE_ORG_OVERVIEW",
    });

    expect(exploreOverviewButton.querySelector("svg")).toBeTruthy();
    await user.click(exploreOverviewButton);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/o/org-1" });
    });
  });

  it("workspace scope: selecting a workspace navigates and updates store", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
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

  it("org scope: trigger becomes back button and navigates to last workspace", async () => {
    const user = userEvent.setup();
    mockPathname = "/o/org-1/settings";

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const backButton = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_BACK_TO_WORKSPACE",
    });
    await user.click(backButton);

    expect(backButton).not.toHaveAttribute("title");
    expect(backButton.querySelector("span.block.w-full.min-w-0.truncate")).toBeTruthy();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-alpha/" });
    });
  });
});
