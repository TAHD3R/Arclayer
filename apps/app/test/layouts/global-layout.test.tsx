import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjects } from "@/api/projects";
import { GlobalLayout } from "@/layouts/global-layout";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

let mockSearchStr = "";
let mockPathname = "/projects";
let mockResolvedPathname: string | null = null;
let preferencesState = {
  sidebarWidthPx: 260,
  setSidebarWidthPx: vi.fn(),
};

function renderWithQueryClient(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
  useNavigate: () => vi.fn(),
  useRouterState: ({
    select,
  }: {
    select: (state: {
      location: { pathname: string; searchStr: string };
      resolvedLocation?: { pathname: string } | null;
    }) => unknown;
  }) =>
    select({
      location: { pathname: mockPathname, searchStr: mockSearchStr },
      resolvedLocation: mockResolvedPathname ? { pathname: mockResolvedPathname } : null,
    }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: typeof preferencesState) => unknown) =>
    selector(preferencesState),
}));

const topbarSpy = vi.fn();
const sceneLayoutSpy = vi.fn();

vi.mock("@/layouts/admin-scene-layout", () => ({
  AdminSceneLayout: ({
    children,
    mainItems,
    browseProjects,
    activeBrowseProjectId,
    renderTopbar,
    sidebarCollapsible,
    sidebarPathnameOverride,
  }: {
    children: React.ReactNode;
    mainItems: Array<{ key: string }>;
    browseProjects?: Array<{ projectId: string; workspaceId: string; name: string }>;
    activeBrowseProjectId?: string | null;
    renderTopbar?: () => React.ReactNode;
    sidebarCollapsible?: "icon" | "none";
    sidebarPathnameOverride?: string;
  }) => {
    sceneLayoutSpy({
      mainItems,
      browseProjects,
      activeBrowseProjectId,
      sidebarCollapsible,
      sidebarPathnameOverride,
    });
    return (
      <div data-testid="admin-scene-layout" data-sidebar-collapsible={sidebarCollapsible}>
        {renderTopbar?.()}
        {children}
      </div>
    );
  },
}));

vi.mock("@/components/layout/admin-topbar", () => ({
  AdminTopbar: (props: { leadingMode?: string }) => {
    topbarSpy(props);
    return <div data-testid="admin-topbar" data-leading-mode={props.leadingMode ?? "none"} />;
  },
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/api/projects", () => ({
  listProjects: vi.fn(),
}));

vi.mock("@/pages/usercenter/projects/hooks/use-project-menu-actions", () => ({
  useProjectMenuActions: () => ({
    buildMenuItems: () => [],
    editingProjectId: null,
    editingProjectField: null,
    editingProjectName: "",
    isProjectEditNavigationSuppressed: false,
    setEditingProjectName: vi.fn(),
    commitProjectEdit: vi.fn(),
    cancelProjectEdit: vi.fn(),
    archiveDialog: {
      project: null,
      setProject: vi.fn(),
      pending: false,
      onConfirm: vi.fn(),
    },
    deleteDialog: {
      project: null,
      setProject: vi.fn(),
      confirmName: "",
      setConfirmName: vi.fn(),
      confirmMatches: false,
      pending: false,
      onConfirm: vi.fn(),
    },
    iconDialog: {
      project: null,
      setProject: vi.fn(),
      values: {
        iconMode: "initials",
        iconColor: "#337ea9",
        iconGlyph: null,
        iconEmoji: null,
        iconUrl: null,
      },
      setValues: vi.fn(),
      pending: false,
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    },
  }),
}));

describe("GlobalLayout", () => {
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
    topbarSpy.mockClear();
    sceneLayoutSpy.mockClear();
    preferencesState = {
      sidebarWidthPx: 260,
      setSidebarWidthPx: vi.fn(),
    };
    mockSearchStr = "";
    mockPathname = "/projects";
    mockResolvedPathname = null;
    useAuthStore.setState({ accessToken: null, sessionVersion: 0 });
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      currentProjectId: null,
      lastWorkspaceId: null,
      lastProjectId: null,
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
  });

  it("keeps the global shell sidebar collapsible so desktop rail can drive collapse", () => {
    renderWithQueryClient(<GlobalLayout />);

    expect(screen.getByTestId("admin-scene-layout")).toHaveAttribute(
      "data-sidebar-collapsible",
      "icon",
    );
    expect(screen.getByTestId("admin-topbar")).toHaveAttribute("data-leading-mode", "none");
  });

  it("keeps global navigation populated and active on the notifications route", () => {
    mockPathname = "/notifications";
    mockSearchStr = "?sourceKind=global&sourcePath=%2Fprojects";

    renderWithQueryClient(<GlobalLayout />);

    const sceneProps = sceneLayoutSpy.mock.calls.at(-1)?.[0];
    expect(sceneProps?.mainItems.length).toBeGreaterThan(0);
    expect(sceneProps?.sidebarPathnameOverride).toBe("/projects");
  });

  it("clears stale project context when returning to a global route", async () => {
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-alpha",
      currentProjectId: "project-alpha",
      lastWorkspaceId: "workspace-alpha",
      lastProjectId: "project-alpha",
    });

    renderWithQueryClient(<GlobalLayout />);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().currentProjectId).toBeNull();
    });
    expect(useWorkspaceStore.getState().lastProjectId).toBe("project-alpha");
  });

  it("keeps global navigation limited to Product entries", () => {
    renderWithQueryClient(<GlobalLayout />);

    const projectsItem = sceneLayoutSpy.mock.calls[0]?.[0]?.mainItems?.find(
      (item: { key: string }) => item.key === "global.projects",
    );
    const navKeys = sceneLayoutSpy.mock.calls[0]?.[0]?.mainItems?.map(
      (item: { key: string }) => item.key,
    );
    expect(projectsItem).toMatchObject({
      labelKey: "nav:NAV_ALL_PROJECTS",
      to: "/projects",
    });
    expect(projectsItem?.children).toBeUndefined();
    expect(
      sceneLayoutSpy.mock.calls[0]?.[0]?.mainItems?.some((item: { key: string }) =>
        item.key.startsWith("global.recent-project."),
      ),
    ).toBe(false);
    expect(navKeys).toHaveLength(6);
  });

  it("includes the resources placeholder before projects in global navigation", () => {
    renderWithQueryClient(<GlobalLayout />);

    const navKeys = sceneLayoutSpy.mock.calls[0]?.[0]?.mainItems?.map(
      (item: { key: string }) => item.key,
    );

    expect(navKeys).toContain("global.resources");
    expect(navKeys.indexOf("global.resources")).toBeGreaterThan(navKeys.indexOf("global.home"));
    expect(navKeys.indexOf("global.resources")).toBeLessThan(navKeys.indexOf("global.projects"));
  });

  it("renders only route content when favorite overlay content-only mode is active", () => {
    mockSearchStr = "?arclayer_favorite_overlay=content-only";

    const { container } = renderWithQueryClient(<GlobalLayout />);

    expect(screen.queryByTestId("admin-scene-layout")).not.toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(container.querySelector(".overflow-auto")).toHaveClass("[scrollbar-gutter:auto]");
  });

  it("keeps persisted sidebar width state available to the global content-only shell", () => {
    mockSearchStr = "?arclayer_favorite_overlay=content-only";

    renderWithQueryClient(<GlobalLayout />);

    expect(usePreferencesStore((state) => state.sidebarWidthPx)).toBe(260);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("passes browse projects into the global admin scene layout", async () => {
    useAuthStore.setState({ accessToken: "token", sessionVersion: 1 });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-alpha",
      currentProjectId: null,
      lastWorkspaceId: "workspace-alpha",
      lastProjectId: null,
    });
    vi.mocked(listProjects).mockResolvedValue({
      items: [
        {
          id: "project-alpha",
          workspaceId: "workspace-alpha",
          slug: "project-alpha",
          name: "Project Alpha",
          description: null,
          iconMode: "glyph",
          iconColor: "#123456",
          iconGlyph: "rocket",
          iconEmoji: null,
          iconUrl: "/assets/project-alpha-icon",
          authoringMode: null,
          authoringState: "migration_required",
          authoringRevision: 1,
          isActive: true,
          archivedAt: null,
          archivedByUserId: null,
          memberCount: 0,
          membersPreview: [],
          createdAt: "2026-04-22T00:00:00Z",
          updatedAt: "2026-04-23T00:00:00Z",
          enterable: true,
          primaryRuntime: null,
        },
      ],
      total: 1,
      page: 1,
      size: 100,
      pages: 1,
      next: null,
      prev: null,
    });

    renderWithQueryClient(<GlobalLayout />);

    await waitFor(() => {
      expect(listProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "workspace-alpha",
          ordering: "-updated_at",
        }),
      );
      expect(sceneLayoutSpy.mock.calls.at(-1)?.[0]?.browseProjects).toEqual([
        expect.objectContaining({
          projectId: "project-alpha",
          workspaceId: "workspace-alpha",
          name: "Project Alpha",
          iconMode: "glyph",
          iconColor: "#123456",
          iconGlyph: "rocket",
          iconEmoji: null,
          iconUrl: "/assets/project-alpha-icon",
        }),
      ]);
      expect(sceneLayoutSpy.mock.calls.at(-1)?.[0]?.activeBrowseProjectId).toBeNull();
      expect(sceneLayoutSpy.mock.calls.at(-1)?.[0]?.mainItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: "global.recent-project.project-alpha",
            label: "Project Alpha",
            to: "/projects/project-alpha",
            iconNode: expect.anything(),
            groupLabelBeforeKey: "nav:NAV_SECTION_PROJECTS",
          }),
        ]),
      );
    });
  });

  it("refreshes global projects navigation when the current workspace changes", async () => {
    useAuthStore.setState({ accessToken: "token", sessionVersion: 1 });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-alpha",
      currentProjectId: null,
      lastWorkspaceId: "workspace-alpha",
      lastProjectId: null,
    });
    vi.mocked(listProjects).mockImplementation(async (params = {}) => {
      if (params.workspaceId === "workspace-alpha") {
        return {
          items: [
            {
              id: "project-alpha",
              workspaceId: "workspace-alpha",
              slug: "project-alpha",
              name: "Project Alpha",
              description: null,
              iconMode: "initials",
              iconColor: "#337ea9",
              iconGlyph: null,
              iconEmoji: null,
              iconUrl: null,
              authoringMode: null,
              authoringState: "migration_required",
              authoringRevision: 1,
              isActive: true,
              archivedAt: null,
              archivedByUserId: null,
              memberCount: 0,
              membersPreview: [],
              createdAt: "2026-04-22T00:00:00Z",
              updatedAt: "2026-04-23T00:00:00Z",
              enterable: true,
              primaryRuntime: null,
            },
          ],
          total: 1,
          page: 1,
          size: 100,
          pages: 1,
          next: null,
          prev: null,
        };
      }

      return {
        items: [],
        total: 0,
        page: 1,
        size: 100,
        pages: 1,
        next: null,
        prev: null,
      };
    });

    renderWithQueryClient(<GlobalLayout />);

    await waitFor(() => {
      expect(sceneLayoutSpy.mock.calls.at(-1)?.[0]?.browseProjects).toEqual([
        expect.objectContaining({ projectId: "project-alpha" }),
      ]);
    });

    act(() => {
      useWorkspaceStore.setState({
        currentWorkspaceId: "workspace-empty",
        currentProjectId: null,
        lastWorkspaceId: "workspace-empty",
        lastProjectId: null,
      });
    });

    await waitFor(() => {
      expect(listProjects).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "workspace-empty" }),
      );
      expect(sceneLayoutSpy.mock.calls.at(-1)?.[0]?.browseProjects).toEqual([]);
    });
  });
});
