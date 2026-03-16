import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MouseEventHandler, ReactNode } from "react";

import { ChromeTabsProvider } from "@celestial/ui/chrome-tabs";
import { AdminLayout } from "@/layouts/admin-layout";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const navigateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
    className?: string;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => null,
  useNavigate: () => navigateMock,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/me/settings" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
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

vi.mock("@/components/layout/admin-header", () => ({
  AdminHeader: () => null,
}));

vi.mock("@/components/layout/admin-account-menu", () => ({
  AdminAccountMenu: () => null,
}));

vi.mock("@/components/layout/route-progress", () => ({
  RouteProgress: () => null,
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/api/notifications", () => ({
  getUnreadNotificationPreview: vi.fn().mockResolvedValue({ unreadCount: 0, items: [] }),
  listNotifications: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    size: 20,
    pages: 1,
    next: null,
    prev: null,
  }),
  markNotificationRead: vi.fn(),
  archiveNotification: vi.fn(),
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: vi.fn().mockResolvedValue({ items: [] }),
}));

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
        {component}
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

describe("AdminNotificationsPanel toggle", () => {
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

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      writable: true,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();

    useAuthStore.setState({ accessToken: null });
    useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
    usePreferencesStore.setState({ notificationPanelPinned: false });
  });

  it("再次点击菜单通知中心会关闭面板，并在关闭后卸载 DOM", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );

    const trigger = await screen.findByRole("button", {
      name: "notifications:NOTIFICATIONS_OPEN_CENTER",
    });

    await user.click(trigger);
    expect(await screen.findByText("NOTIFICATIONS_PAGE_TITLE")).toBeInTheDocument();

    await user.click(trigger);
    await waitFor(() => {
      expect(screen.queryByText("NOTIFICATIONS_PAGE_TITLE")).not.toBeInTheDocument();
    });
  });

  it("点击面板底部“打开通知中心”后会关闭面板并跳转", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );

    const trigger = await screen.findByRole("button", {
      name: "notifications:NOTIFICATIONS_OPEN_CENTER",
    });
    await user.click(trigger);
    expect(await screen.findByText("NOTIFICATIONS_PAGE_TITLE")).toBeInTheDocument();

    const openCenterButton = await screen.findByRole("button", {
      name: "NOTIFICATIONS_OPEN_CENTER",
    });
    await user.click(openCenterButton);

    await waitFor(() => {
      expect(screen.queryByText("NOTIFICATIONS_PAGE_TITLE")).not.toBeInTheDocument();
    });
    expect(navigateMock).toHaveBeenCalledWith({ to: "/me/inbox" });
  });
});
