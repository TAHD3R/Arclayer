import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalLayout } from "@/layouts/global-layout";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";

let mockSearchStr = "";

function collectNavKeys(
  items: Array<{ key: string; children?: Array<{ key: string }> }>,
): string[] {
  return items.flatMap((item) => [
    item.key,
    ...(item.children ? collectNavKeys(item.children) : []),
  ]);
}

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
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
    render(<GlobalLayout />);

    expect(screen.getByTestId("admin-scene-layout")).toHaveAttribute(
      "data-sidebar-collapsible",
      "icon",
    );
  });

  it("hides system settings from non-super-admin global navigation", () => {
    render(<GlobalLayout />);

    const navKeys = topbarSpy.mock.calls[0]?.[0]?.navItems?.map(
      (item: { key: string }) => item.key,
    );
    expect(navKeys).not.toContain("global.system");
    expect(
      sceneLayoutSpy.mock.calls[0]?.[0]?.mainItems?.map((item: { key: string }) => item.key),
    ).not.toContain("global.system");
  });

  it("shows system settings when the current user is a super admin", () => {
    vi.mocked(useCurrentUserProfile).mockReturnValue({
      isSuperAdmin: true,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      profile: { isSuperAdmin: true },
    } as unknown as ReturnType<typeof useCurrentUserProfile>);

    render(<GlobalLayout />);

    const navKeys = collectNavKeys(topbarSpy.mock.calls[0]?.[0]?.navItems ?? []);
    expect(navKeys).toContain("global.system");
  });

  it("renders only route content when favorite overlay content-only mode is active", () => {
    mockSearchStr = "?arclayer_favorite_overlay=content-only";

    render(<GlobalLayout />);

    expect(screen.queryByTestId("admin-scene-layout")).not.toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });
});
