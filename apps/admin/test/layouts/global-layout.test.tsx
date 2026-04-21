import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalLayout } from "@/layouts/global-layout";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { usePreferencesStore } from "@/stores/use-preference-store";

let mockSearchStr = "";
let preferencesState = {
  sidebarWidthPx: 260,
  setSidebarWidthPx: vi.fn(),
};

function collectNavKeys(
  items: Array<{ key: string; children?: Array<{ key: string }> }>,
): string[] {
  return items.flatMap((item) => [
    item.key,
    ...(item.children ? collectNavKeys(item.children) : []),
  ]);
}

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
    select: (state: { location: { searchStr: string } }) => unknown;
  }) => select({ location: { searchStr: mockSearchStr } }),
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
    renderTopbar,
    sidebarCollapsible,
  }: {
    children: React.ReactNode;
    mainItems: Array<{ key: string }>;
    renderTopbar?: (props: {
      notificationOpen: boolean;
      showNotificationsBadge: boolean;
      unreadCount: number;
      onNotificationToggle: () => void;
    }) => React.ReactNode;
    sidebarCollapsible?: "icon" | "none";
  }) => {
    sceneLayoutSpy({ mainItems, sidebarCollapsible });
    return (
      <div data-testid="admin-scene-layout" data-sidebar-collapsible={sidebarCollapsible}>
        {renderTopbar?.({
          notificationOpen: false,
          showNotificationsBadge: false,
          unreadCount: 0,
          onNotificationToggle: vi.fn(),
        })}
        {children}
      </div>
    );
  },
}));

vi.mock("@/components/layout/admin-topbar", () => ({
  AdminTopbar: (props: { navItems: Array<{ key: string }> }) => {
    topbarSpy(props);
    return <div data-testid="admin-topbar" data-nav-count={props.navItems.length} />;
  },
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/use-current-user-profile", () => ({
  useCurrentUserProfile: vi.fn(),
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
    vi.mocked(useCurrentUserProfile).mockReturnValue({
      isSuperAdmin: false,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      profile: null,
    } as unknown as ReturnType<typeof useCurrentUserProfile>);
  });

  it("keeps the global shell sidebar collapsible so desktop rail can drive collapse", () => {
    renderWithQueryClient(<GlobalLayout />);

    expect(screen.getByTestId("admin-scene-layout")).toHaveAttribute(
      "data-sidebar-collapsible",
      "icon",
    );
    expect(topbarSpy.mock.calls[0]?.[0]?.sidebarToggleMode).toBe("always");
  });

  it("keeps projects visible while hiding platform from non-super-admin global navigation", () => {
    renderWithQueryClient(<GlobalLayout />);

    const navKeys = topbarSpy.mock.calls[0]?.[0]?.navItems?.map(
      (item: { key: string }) => item.key,
    );
    expect(navKeys).toContain("global.projects");
    expect(navKeys).not.toContain("global.platform");
    expect(
      sceneLayoutSpy.mock.calls[0]?.[0]?.mainItems?.map((item: { key: string }) => item.key),
    ).toContain("global.projects");
  });

  it("shows platform alongside projects when the current user is a super admin", () => {
    vi.mocked(useCurrentUserProfile).mockReturnValue({
      isSuperAdmin: true,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      profile: { isSuperAdmin: true },
    } as unknown as ReturnType<typeof useCurrentUserProfile>);

    renderWithQueryClient(<GlobalLayout />);

    const navKeys = collectNavKeys(topbarSpy.mock.calls[0]?.[0]?.navItems ?? []);
    expect(navKeys).toContain("global.projects");
    expect(navKeys).toContain("global.platform");
    expect(navKeys).toContain("global.platform.overview");
    expect(navKeys).toContain("global.platform.tenants");
  });

  it("includes the resources placeholder before projects in global navigation", () => {
    renderWithQueryClient(<GlobalLayout />);

    const navKeys = topbarSpy.mock.calls[0]?.[0]?.navItems?.map(
      (item: { key: string }) => item.key,
    );

    expect(navKeys).toContain("global.resources");
    expect(navKeys.indexOf("global.resources")).toBeGreaterThan(navKeys.indexOf("global.home"));
    expect(navKeys.indexOf("global.resources")).toBeLessThan(navKeys.indexOf("global.projects"));
  });

  it("renders only route content when favorite overlay content-only mode is active", () => {
    mockSearchStr = "?arclayer_favorite_overlay=content-only";

    renderWithQueryClient(<GlobalLayout />);

    expect(screen.queryByTestId("admin-scene-layout")).not.toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("keeps persisted sidebar width state available to the global content-only shell", () => {
    mockSearchStr = "?arclayer_favorite_overlay=content-only";

    renderWithQueryClient(<GlobalLayout />);

    expect(usePreferencesStore((state) => state.sidebarWidthPx)).toBe(260);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });
});
