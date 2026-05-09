import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { AdminLayout } from "@/layouts/admin-layout";
import { listAllContentModels } from "@/api/content";
import { getProjectDetail, listProjects } from "@/api/projects";
import { getWorkspaceDetail } from "@/api/workspaces";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useSidebar } from "@arclayer/ui/sidebar";

let mockPathname = "/projects/ws-1/content/create";
let mockResolvedPathname: string | null = null;
let mockSearchObject: Record<string, unknown> = {};
let mockSearchStr = "";
const navigateMock = vi.fn().mockResolvedValue(undefined);
const capturedSceneProps: Array<Record<string, unknown>> = [];

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => null,
  useNavigate: () => navigateMock,
  useRouterState: ({
    select,
  }: {
    select: (state: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
        searchStr: string;
      };
      resolvedLocation?: {
        pathname: string;
      } | null;
    }) => unknown;
  }) =>
    select({
      location: {
        pathname: mockPathname,
        search: mockSearchObject,
        searchStr: mockSearchStr,
      },
      resolvedLocation: mockResolvedPathname ? { pathname: mockResolvedPathname } : null,
    }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/hooks/use-system-runtime", () => ({
  useSystemRuntime: () => ({
    runtime: {
      capabilities: {
        deploymentSettingsEnabled: true,
        publicRegisterEnabled: false,
      },
    },
  }),
}));

vi.mock("@/hooks/use-workspace-localization", () => ({
  useWorkspaceLocalization: () => ({
    localization: {
      locale: undefined,
      timezone: undefined,
      dateFormat: undefined,
    },
  }),
}));

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDetail: vi.fn(),
}));

vi.mock("@/api/content", () => ({
  buildContentModelsQueryKey: (projectId: string) => ["content", "models", projectId],
  listAllContentModels: vi.fn(),
}));

vi.mock("@/api/projects", () => ({
  getProjectDetail: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("@/layouts/admin-scene-layout", () => ({
  AdminSceneLayout: (props: Record<string, unknown> & { children?: ReactNode }) => {
    capturedSceneProps.push(props);
    return <div data-testid="scene-layout">{props.children}</div>;
  },
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

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

function latestSceneProps() {
  const latest = capturedSceneProps.at(-1);
  expect(latest).toBeDefined();
  return latest as {
    mainItems: Array<{
      key: string;
      children?: Array<{
        key: string;
        children?: Array<{ key: string }>;
      }>;
    }>;
    browseProjects?: Array<{ projectId: string; name: string }>;
    activeBrowseProjectId?: string | null;
    favoriteWorkspaceBase?: string | null;
    sidebarPathnameOverride?: string;
    commandScope?: { pathname?: string };
    loading?: boolean;
    renderTopbar?: () => React.ReactElement<{
      breadcrumbs?: Array<{ key: string; label: string }>;
    }>;
  };
}

function SidebarConsumerProbe() {
  const sidebar = useSidebar();
  return (
    <div
      data-testid="sidebar-probe"
      data-layout-state={sidebar.layoutState}
      data-visual-state={sidebar.state}
    >
      {sidebar.state}
    </div>
  );
}

describe("sidebar route state wiring", () => {
  beforeEach(() => {
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
    capturedSceneProps.length = 0;
    navigateMock.mockClear();
    mockPathname = "/projects/ws-1/content/create";
    mockResolvedPathname = null;
    mockSearchObject = {};
    mockSearchStr = "";
    useAuthStore.setState({ accessToken: null, sessionVersion: 0 });
    usePreferencesStore.setState({
      localePreferenceMode: "browser",
      setEffectiveLocale: vi.fn(),
      cacheWorkspaceLocale: vi.fn(),
    });
    useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
    vi.mocked(listProjects).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 100,
      pages: 1,
      next: null,
      prev: null,
    });
    vi.mocked(getProjectDetail).mockResolvedValue({
      project: {
        id: "ws-1",
        workspaceId: "workspace-1",
        slug: "ws-1",
        name: "Project ws-1",
        description: null,
        iconMode: "initials",
        iconColor: "#337ea9",
        iconGlyph: null,
        iconEmoji: null,
        iconUrl: null,
        isActive: true,
      },
      primaryRuntime: null,
    });
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "workspace-1",
      project: null,
      name: "Workspace One",
      description: null,
      kind: "team",
      iconMode: "initials",
      iconColor: "#337ea9",
      iconGlyph: null,
      iconEmoji: null,
      iconUrl: null,
      iconAssetAligned: false,
    } as Awaited<ReturnType<typeof getWorkspaceDetail>>);
    vi.mocked(listAllContentModels).mockResolvedValue([]);
  });

  it("derives workspace sidebar items from the pathname even before workspace store hydration", () => {
    renderWithQueryClient(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );

    const props = latestSceneProps();

    expect(screen.getByTestId("scene-layout")).toBeInTheDocument();
    expect(props.favoriteWorkspaceBase).toBe("/projects/ws-1");
    expect(props.mainItems.map((item) => item.key)).toEqual([
      "dashboard",
      "activity",
      "assets",
      "content.library",
      "content.models",
      "website.analytics",
      "settings.site",
      "apps.manage",
      "apps.market",
      "automations",
      "settings.project",
    ]);
  });

  it("keeps the admin shell aligned with the resolved outlet route while navigation is pending", () => {
    mockPathname = "/projects/ws-1/activity";
    mockResolvedPathname = "/projects/ws-1/settings/general";

    renderWithQueryClient(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );

    const props = latestSceneProps();
    const topbar = props.renderTopbar?.();

    expect(props.commandScope?.pathname).toBe("/projects/ws-1/settings/general");
    expect(props.sidebarPathnameOverride).toBe("/projects/ws-1/settings/general");
    expect(topbar?.props.breadcrumbs?.at(-1)?.key).toBe("settings.project");
  });

  it("keeps the project shell visible while workspace detail is still loading", () => {
    vi.mocked(getWorkspaceDetail).mockImplementation(
      () => new Promise(() => undefined) as ReturnType<typeof getWorkspaceDetail>,
    );
    useAuthStore.setState({ accessToken: "token", sessionVersion: 1 });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      currentProjectId: "ws-1",
    });

    renderWithQueryClient(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );

    const props = latestSceneProps();

    expect(screen.getByTestId("scene-layout")).toBeInTheDocument();
    expect(props.favoriteWorkspaceBase).toBe("/projects/ws-1");
    expect(props.loading).toBe(false);
  });

  it("syncs the browse tab project identity on project routes", async () => {
    mockPathname = "/projects/project-alpha/content/library";
    useAuthStore.setState({ accessToken: "token", sessionVersion: 1 });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-alpha",
      currentProjectId: "project-alpha",
    });
    vi.mocked(listProjects).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 100,
      pages: 1,
      next: null,
      prev: null,
    });
    vi.mocked(getProjectDetail).mockResolvedValue({
      project: {
        id: "project-alpha",
        workspaceId: "workspace-alpha",
        slug: "project-alpha",
        name: "Project Alpha",
        description: null,
        iconMode: "glyph",
        iconColor: "#123456",
        iconGlyph: "rocket",
        iconEmoji: null,
        iconUrl: null,
        isActive: true,
      },
      primaryRuntime: null,
    });

    renderWithQueryClient(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      const props = latestSceneProps();

      expect(props.activeBrowseProjectId).toBe("project-alpha");
      expect(props.browseProjects).toEqual([
        expect.objectContaining({
          projectId: "project-alpha",
          name: "Project Alpha",
        }),
      ]);
    });
  });

  it("adds the selected content model to project breadcrumbs on the edit route", async () => {
    mockPathname = "/projects/project-alpha/content/models/edit";
    mockSearchStr = "?modelId=model-1";
    useAuthStore.setState({ accessToken: "token", sessionVersion: 1 });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-alpha",
      currentProjectId: "project-alpha",
    });
    vi.mocked(listAllContentModels).mockResolvedValue([
      {
        id: "model-1",
        workspaceId: "workspace-alpha",
        siteId: "site-1",
        singularKey: "article",
        pluralKey: "articles",
        name: "Article",
        description: null,
        category: "custom",
        modelKind: "collection_type",
        capabilities: ["queryable"],
        defaultEditor: "form",
        draftContractRevision: 1,
        updatedAt: "2026-04-28T00:00:00Z",
        updatedByUserId: null,
        updatedBy: null,
      },
    ]);

    renderWithQueryClient(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      const topbar = latestSceneProps().renderTopbar?.();
      expect(topbar?.props.breadcrumbs?.map((item) => item.label)).toEqual([
        "nav:NAV_GROUP_WEBSITE",
        "Content Model",
        "Article",
      ]);
    });
  });

  it("renders route content without the admin scene shell in favorite overlay content-only mode", () => {
    mockSearchStr = "?arclayer_favorite_overlay=content-only";

    renderWithQueryClient(
      <AdminLayout>
        <div data-testid="embedded-route-content">
          embedded content
          <SidebarConsumerProbe />
        </div>
      </AdminLayout>,
    );

    expect(screen.queryByTestId("scene-layout")).not.toBeInTheDocument();
    expect(screen.getByTestId("embedded-route-content")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-probe")).toHaveTextContent("expanded");
    expect(screen.getByTestId("sidebar-probe")).toHaveAttribute("data-layout-state", "expanded");
  });
});
