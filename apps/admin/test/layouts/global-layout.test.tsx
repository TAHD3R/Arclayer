import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalLayout } from "@/layouts/global-layout";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
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

vi.mock("@/hooks/use-current-user-profile", () => ({
  useCurrentUserProfile: vi.fn(),
}));

describe("GlobalLayout", () => {
  beforeEach(() => {
    topbarSpy.mockClear();
    sceneLayoutSpy.mockClear();
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

    const navKeys = topbarSpy.mock.calls[0]?.[0]?.navItems?.map(
      (item: { key: string }) => item.key,
    );
    expect(navKeys).toContain("global.system");
  });
});
