import type { ReactNode } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSceneLayout } from "@/layouts/admin-scene-layout";

const {
  adminSidebarShellSpy,
  getUnreadNotificationPreviewMock,
  archiveItemMock,
  deleteItemMock,
  markReadMock,
  openTargetMock,
  toastInfoMock,
} = vi.hoisted(() => ({
  adminSidebarShellSpy: vi.fn(),
  getUnreadNotificationPreviewMock: vi.fn(),
  archiveItemMock: vi.fn(),
  deleteItemMock: vi.fn(),
  markReadMock: vi.fn(),
  openTargetMock: vi.fn(),
  toastInfoMock: vi.fn(),
}));

vi.mock("@/api/notifications", () => ({
  getUnreadNotificationPreview: (...args: unknown[]) => getUnreadNotificationPreviewMock(...args),
}));

vi.mock("@/components/layout/admin-sidebar-shell", () => ({
  AdminSidebarShell: (props: Record<string, unknown>) => {
    adminSidebarShellSpy(props);
    return <div data-testid="admin-sidebar-shell" />;
  },
}));

vi.mock("@/components/layout/route-progress", () => ({
  RouteProgress: () => null,
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@arclayer/ui/sidebar", () => ({
  SidebarInset: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div data-testid="sidebar-inset" className={className}>
      {children}
    </div>
  ),
  SidebarProvider: ({ children }: { children?: ReactNode }) => (
    <div data-testid="sidebar-provider">{children}</div>
  ),
}));

vi.mock("@arclayer/ui/admin-toast", () => ({
  message: {
    info: (...args: unknown[]) => toastInfoMock(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    dismiss: vi.fn(),
  },
}));

vi.mock("@/hooks/use-notification-actions", () => ({
  useNotificationActions: () => ({
    archiveItem: (...args: unknown[]) => archiveItemMock(...args),
    deleteItem: (...args: unknown[]) => deleteItemMock(...args),
    markRead: (...args: unknown[]) => markReadMock(...args),
    openTarget: (...args: unknown[]) => openTargetMock(...args),
  }),
}));

const authState = {
  accessToken: "token-1",
  sessionVersion: 7,
};

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

const preferencesState = {
  showNotificationsBadge: true,
  sidebarOpen: true,
  sidebarWidthPx: 280,
  setSidebarOpen: vi.fn(),
  setSidebarWidthPx: vi.fn(),
};

vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: typeof preferencesState) => unknown) =>
    selector(preferencesState),
}));

function createNotification(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "notif-1",
    workspaceId: "ws-1",
    recipientUserId: "user-1",
    category: "team",
    title: "Review ready",
    body: "The latest changes are ready to review.",
    targetTo: "/projects/project-1",
    targetMeta: null,
    eventName: null,
    dedupeKey: null,
    readAt: null,
    archivedAt: null,
    createdAt: "2026-04-22T10:00:00Z",
    updatedAt: "2026-04-22T10:00:00Z",
    ...overrides,
  };
}

function renderSceneLayout(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminSceneLayout
        renderTopbar={() => <div data-testid="topbar" />}
        mainItems={[]}
        sidebarCollapsible="icon"
      >
        <div data-testid="layout-content" />
      </AdminSceneLayout>
    </QueryClientProvider>,
  );
}

describe("AdminSceneLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preferencesState.setSidebarOpen.mockReset();
    preferencesState.setSidebarWidthPx.mockReset();
    archiveItemMock.mockResolvedValue(true);
    deleteItemMock.mockResolvedValue(true);
    markReadMock.mockResolvedValue(true);
    openTargetMock.mockResolvedValue(true);
  });

  it("keeps the initial unread preview silent while still wiring the inbox badge", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    queryClient.setQueryData(["notifications", "preview", authState.sessionVersion], {
      unreadCount: 1,
      items: [createNotification()],
    });

    renderSceneLayout(queryClient);

    expect(toastInfoMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(adminSidebarShellSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          showInboxBadge: true,
          unreadInboxCount: 1,
        }),
      );
    });
  });

  it("stacks one toast per newly arrived unread preview item after a refetch", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    queryClient.setQueryData(["notifications", "preview", authState.sessionVersion], {
      unreadCount: 1,
      items: [createNotification()],
    });

    renderSceneLayout(queryClient);

    await waitFor(() => {
      expect(adminSidebarShellSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          unreadInboxCount: 1,
        }),
      );
    });
    expect(toastInfoMock).not.toHaveBeenCalled();

    act(() => {
      queryClient.setQueryData(["notifications", "preview", authState.sessionVersion], {
        unreadCount: 3,
        items: [
          createNotification({
            id: "notif-2",
            title: "Build finished",
            body: "All changes are ready.",
            createdAt: "2026-04-22T10:05:00Z",
            updatedAt: "2026-04-22T10:05:00Z",
          }),
          createNotification({
            id: "notif-3",
            title: "Member joined",
            body: "A new teammate now has access.",
            createdAt: "2026-04-22T10:06:00Z",
            updatedAt: "2026-04-22T10:06:00Z",
          }),
        ],
      });
    });

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledTimes(2);
    });
    expect(toastInfoMock.mock.calls[0]?.[1]).toMatchObject({ duration: 12000 });
  });
});
