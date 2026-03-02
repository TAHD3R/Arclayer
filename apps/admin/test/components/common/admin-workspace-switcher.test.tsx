import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MyOrganization, MyOrganizationListResult, OrganizationWorkspace } from "@/types/api";
import { listMyOrganizations } from "@/api/me";
import { listAllOrganizationWorkspaces } from "@/api/organization-workspaces";
import { getWorkspaceDetail } from "@/api/workspaces";
import {
  AdminOrgSwitcher,
  AdminWorkspaceSwitcher,
} from "@/components/layout/admin-workspace-switcher";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: "/w/ws-alpha/assets" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/me", () => ({
  listMyOrganizations: vi.fn(),
}));

vi.mock("@/api/organization-workspaces", () => ({
  listAllOrganizationWorkspaces: vi.fn(),
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

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

function getLatestDialog(): HTMLElement {
  const dialogs = screen.getAllByRole("dialog");
  const latest = dialogs[dialogs.length - 1];
  if (!latest) {
    throw new Error("No dialog found");
  }
  return latest;
}

describe("AdminOrgSwitcher", () => {
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

    useAuthStore.setState({ accessToken: "token" });
    useWorkspaceStore.setState({ currentWorkspaceId: "ws-alpha", lastWorkspaceId: "ws-alpha" });

    vi.mocked(listMyOrganizations).mockResolvedValue(organizationsFixture);
    vi.mocked(listAllOrganizationWorkspaces).mockResolvedValue(workspaceFixturesOrg1);
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-alpha",
      organizationId: "org-1",
      slug: "alpha",
      name: "Workspace Alpha",
    });
  });

  it("trigger 显示当前组织名", async () => {
    renderWithQueryClient(<AdminOrgSwitcher />);

    await waitFor(() => {
      expect(screen.getByText(/Org Alpha/)).toBeInTheDocument();
    });
  });

  it("打开面板后显示组织列表", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminOrgSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_ORG",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    expect(await within(panel).findByText("Org Alpha")).toBeInTheDocument();
    expect(within(panel).getByText("Org Beta")).toBeInTheDocument();
  });

  it("点击组织项会导航到组织页面", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminOrgSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_ORG",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    const orgAlphaButton = await within(panel).findByRole("button", {
      name: /Org Alpha/i,
    });
    await user.click(orgAlphaButton);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
    });
  });
});

describe("AdminWorkspaceSwitcher", () => {
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

    useAuthStore.setState({ accessToken: "token" });
    useWorkspaceStore.setState({ currentWorkspaceId: "ws-alpha", lastWorkspaceId: "ws-alpha" });

    vi.mocked(listMyOrganizations).mockResolvedValue(organizationsFixture);
    vi.mocked(listAllOrganizationWorkspaces).mockResolvedValue(workspaceFixturesOrg1);
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-alpha",
      organizationId: "org-1",
      slug: "alpha",
      name: "Workspace Alpha",
    });
  });

  it("trigger 显示当前工作区名", async () => {
    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    await waitFor(() => {
      expect(screen.getByText(/Workspace Alpha/)).toBeInTheDocument();
    });
  });

  it("打开面板后显示工作区列表", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    expect(await within(panel).findByText("Workspace Alpha")).toBeInTheDocument();
    expect(within(panel).getByText("Workspace Beta")).toBeInTheDocument();
  });

  it("点击工作区项会切换到对应工作区路径", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AdminWorkspaceSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "common:WORKSPACE_SWITCHER_SELECT_WORKSPACE",
    });
    await user.click(trigger);

    const panel = getLatestDialog();
    const workspaceBetaButton = await within(panel).findByRole("button", {
      name: /Workspace Beta/i,
    });
    await user.click(workspaceBetaButton);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-beta/assets" });
    });
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-beta");
  });
});
