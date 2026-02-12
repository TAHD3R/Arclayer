import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MyOrganization, MyOrganizationListResult } from "@/api/me";
import { listMyOrganizations } from "@/api/me";
import type { OrganizationWorkspace } from "@/api/organization-workspaces";
import { listAllOrganizationWorkspaces } from "@/api/organization-workspaces";
import { getWorkspaceDetail } from "@/api/workspaces";
import { AdminWorkspaceSwitcher } from "@/components/common/admin-workspace-switcher";
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
  createMyOrganization: vi.fn(),
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

const workspaceFixturesOrg2: OrganizationWorkspace[] = [
  {
    id: "workspace-link-3",
    workspaceId: "ws-gamma",
    organizationId: "org-2",
    slug: "gamma",
    name: "Workspace Gamma",
    description: "Gamma description",
    iconUrl: null,
    isArchived: false,
    archivedAt: null,
    archivedByUserId: null,
    memberCount: 1,
    membersPreview: [],
    createdAt: "2026-01-03T00:00:00Z",
    enterable: true,
  },
];

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminWorkspaceSwitcher />
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

async function openSwitcher(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Org Alpha/ }));
  return getLatestDialog();
}

async function hoverOrganizationInPanel(
  user: ReturnType<typeof userEvent.setup>,
  organizationName: string,
) {
  const panel = getLatestDialog();
  const label = within(panel).getByText(organizationName);
  const button = label.closest("button");
  if (!button) throw new Error(`Organization item button not found: ${organizationName}`);
  await user.hover(button);
}

function getOrganizationButton(organizationName: string): HTMLButtonElement {
  const panel = getLatestDialog();
  const label = within(panel).getByText(organizationName);
  const button = label.closest("button");
  if (!button) throw new Error(`Organization item button not found: ${organizationName}`);
  return button;
}

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
    vi.mocked(listAllOrganizationWorkspaces).mockImplementation(async (params) => {
      if (params?.organizationId === "org-2") return workspaceFixturesOrg2;
      return workspaceFixturesOrg1;
    });
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-alpha",
      organizationId: "org-1",
      slug: "alpha",
      name: "Workspace Alpha",
    });
  });

  it("工作区作用域 trigger 显示组织与工作区名称", async () => {
    const user = userEvent.setup();

    renderWithQueryClient();

    expect(
      await screen.findByRole("button", { name: /Org Alpha \/ Workspace Alpha/ }),
    ).toBeInTheDocument();

    await openSwitcher(user);
  });

  it("默认仅显示组织列表，hover 组织后才展示工作区面板", async () => {
    const user = userEvent.setup();

    renderWithQueryClient();

    await openSwitcher(user);

    expect(screen.queryByText("Workspace Alpha")).not.toBeInTheDocument();

    await hoverOrganizationInPanel(user, "Org Alpha");

    expect(await screen.findByText("Workspace Alpha")).toBeInTheDocument();
    expect(screen.getByText("Workspace Beta")).toBeInTheDocument();
  });

  it("鼠标离开切换器后，工作区面板会收起", async () => {
    const user = userEvent.setup();

    renderWithQueryClient();

    await openSwitcher(user);
    await hoverOrganizationInPanel(user, "Org Alpha");
    expect(await within(getLatestDialog()).findByText("Workspace Alpha")).toBeInTheDocument();

    await user.unhover(getOrganizationButton("Org Alpha"));

    expect(within(getLatestDialog()).getByText("Workspace Alpha")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(within(getLatestDialog()).queryByText("Workspace Alpha")).not.toBeInTheDocument();
      },
      { timeout: 500 },
    );
  });

  it("点击组织项会跳转到对应组织主页", async () => {
    const user = userEvent.setup();

    renderWithQueryClient();

    const panel = await openSwitcher(user);

    const betaLabel = within(panel).getByText("Org Beta");
    const betaButton = betaLabel.closest("button");
    if (!betaButton) throw new Error("Organization button not found: Org Beta");
    await user.click(betaButton);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/o/org-2" });
    });
  });

  it("组织搜索不会联动修改当前工作区列表", async () => {
    const user = userEvent.setup();

    renderWithQueryClient();

    await openSwitcher(user);
    await hoverOrganizationInPanel(user, "Org Alpha");
    expect(await screen.findByText("Workspace Alpha")).toBeInTheDocument();

    const panel = getLatestDialog();
    const orgSearchInput = within(panel).getByPlaceholderText(
      "common:WORKSPACE_SWITCHER_ORG_SEARCH_PLACEHOLDER",
    );
    await user.type(orgSearchInput, "beta");

    expect(within(getLatestDialog()).getByText("Workspace Alpha")).toBeInTheDocument();
    expect(within(getLatestDialog()).getByText("Workspace Beta")).toBeInTheDocument();
    expect(within(getLatestDialog()).queryByText("Workspace Gamma")).not.toBeInTheDocument();
  });

  it("点击工作区项会切换到对应工作区路径", async () => {
    const user = userEvent.setup();

    renderWithQueryClient();

    await openSwitcher(user);
    await hoverOrganizationInPanel(user, "Org Alpha");
    expect(await screen.findByText("Workspace Alpha")).toBeInTheDocument();

    const workspacePanel = getLatestDialog();
    const workspaceBetaButton = within(workspacePanel).getByRole("button", {
      name: /Workspace Beta/i,
    });

    await user.click(workspaceBetaButton);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-beta/assets" });
    });
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBe("ws-beta");
  });

  it("创建工作区按钮会跳转到组织工作区页并带 create 参数", async () => {
    const user = userEvent.setup();

    renderWithQueryClient();

    await openSwitcher(user);
    await hoverOrganizationInPanel(user, "Org Alpha");
    expect(await screen.findByText("Workspace Alpha")).toBeInTheDocument();

    const workspacePanel = getLatestDialog();
    const createWorkspaceButton = within(workspacePanel).getByRole("button", {
      name: "common:WORKSPACE_SWITCHER_CREATE",
    });

    await user.click(createWorkspaceButton);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/o/org-1/workspaces",
        search: { create: "1" },
      });
    });
  });

  it("新增组织弹窗使用新结构且不包含 slug 输入框", async () => {
    const user = userEvent.setup();

    renderWithQueryClient();

    await openSwitcher(user);
    await user.click(
      await screen.findByRole("button", { name: "common:WORKSPACE_SWITCHER_CREATE_ORG" }),
    );

    expect(
      await screen.findByPlaceholderText("common:WORKSPACE_SWITCHER_CREATE_ORG_NAME_PLACEHOLDER"),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("example-org")).not.toBeInTheDocument();
  });
});
