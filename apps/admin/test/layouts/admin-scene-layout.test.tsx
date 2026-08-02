import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotificationOut as NotificationItem } from "@arclayer/openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import { useAiChatStore } from "@/stores/use-ai-chat-store";

const {
  adminSidebarShellSpy,
  getUnreadNotificationPreviewMock,
  archiveItemMock,
  deleteItemMock,
  markReadMock,
  openTargetMock,
  recordInteractionMock,
  toastInfoMock,
  routeTransitionSpy,
  aiDrawerOverlaySpy,
  globalNotificationSurfacesSpy,
  sidebarProviderSpy,
} = vi.hoisted(() => ({
  adminSidebarShellSpy: vi.fn(),
  getUnreadNotificationPreviewMock: vi.fn(),
  archiveItemMock: vi.fn(),
  deleteItemMock: vi.fn(),
  markReadMock: vi.fn(),
  openTargetMock: vi.fn(),
  recordInteractionMock: vi.fn(),
  toastInfoMock: vi.fn(),
  routeTransitionSpy: vi.fn(),
  aiDrawerOverlaySpy: vi.fn(),
  globalNotificationSurfacesSpy: vi.fn(),
  sidebarProviderSpy: vi.fn(),
}));

vi.mock("@/api/notifications", () => ({
  getUnreadNotificationPreview: (...args: unknown[]) => getUnreadNotificationPreviewMock(...args),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: () => "2026-04-22 10:05",
  }),
}));

vi.mock("@/components/common/global-notification-surfaces", () => ({
  getGlobalNotificationMeta: (item: { eventName?: string | null; campaignSurface?: unknown }) => {
    if (item.eventName !== "system.broadcast") return null;
    return item.campaignSurface ?? null;
  },
  GlobalNotificationSurfaces: (props: Record<string, unknown>) => {
    globalNotificationSurfacesSpy(props);
    return <div data-testid="global-notification-surfaces" />;
  },
}));

vi.mock("@/components/layout/admin-sidebar-shell", () => ({
  AdminSidebarShell: (props: Record<string, unknown>) => {
    adminSidebarShellSpy(props);
    return <div data-testid="admin-sidebar-shell" />;
  },
}));

vi.mock("@/components/ai/arclayer-assistant-scope", () => ({
  ArclayerAssistantScope: ({
    children,
  }: {
    children: (assistantAvailable: boolean) => ReactNode;
  }) => children(true),
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: (props: { children?: ReactNode; className?: string }) => {
    routeTransitionSpy(props);
    return <>{props.children}</>;
  },
}));

vi.mock("@/components/ai/ai-drawer-overlay", () => ({
  AIDrawerOverlay: (props: { widthPx: number; assistantAvailable: boolean }) => {
    aiDrawerOverlaySpy(props);
    return <div data-testid="ai-drawer-overlay" style={{ width: props.widthPx }} />;
  },
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@arclayer/ui/sidebar", () => ({
  SidebarInset: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div data-testid="sidebar-inset" className={className}>
      {children}
    </div>
  ),
  SidebarProvider: ({ children, ...props }: { children?: ReactNode; open?: boolean }) => {
    sidebarProviderSpy(props);
    return <div data-testid="sidebar-provider">{children}</div>;
  },
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
    recordInteraction: (...args: unknown[]) => recordInteractionMock(...args),
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
  aiDrawerWidthPx: 380,
  setSidebarOpen: vi.fn(),
  setSidebarWidthPx: vi.fn(),
  setAiDrawerWidthPx: vi.fn(),
};

vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: typeof preferencesState) => unknown) =>
    selector(preferencesState),
}));

function createNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "notif-1",
    workspaceId: "ws-1",
    recipientUserId: "user-1",
    category: "team",
    title: "Review ready",
    body: "The latest changes are ready to review.",
    target: {
      kind: "project",
      projectId: "project-1",
      destination: "overview",
    },
    campaignSurface: null,
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

function createPointerEvent(type: string, init: MouseEventInit & { pointerId?: number }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "pointerId", {
    configurable: true,
    value: init.pointerId ?? 1,
  });
  return event;
}

describe("AdminSceneLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preferencesState.setSidebarOpen.mockReset();
    preferencesState.setSidebarWidthPx.mockReset();
    preferencesState.setAiDrawerWidthPx.mockReset();
    preferencesState.sidebarOpen = true;
    preferencesState.aiDrawerWidthPx = 380;
    useAiChatStore.setState({
      drawerOpen: false,
    });
    getUnreadNotificationPreviewMock.mockResolvedValue({
      unreadCount: 0,
      items: [],
    });
    archiveItemMock.mockResolvedValue(true);
    deleteItemMock.mockResolvedValue(true);
    markReadMock.mockResolvedValue(true);
    openTargetMock.mockResolvedValue(true);
    recordInteractionMock.mockResolvedValue(true);
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
    expect(routeTransitionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        className: "min-w-0 max-w-full w-full",
      }),
    );
    await waitFor(() => {
      expect(adminSidebarShellSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          showInboxBadge: true,
          unreadInboxCount: 1,
          assistantAvailable: true,
        }),
      );
    });
    expect(globalNotificationSurfacesSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ id: "notif-1" })],
        onOpenTarget: expect.any(Function),
        onRecordInteraction: expect.any(Function),
      }),
    );
  });

  it("refreshes the unread notification preview every 30 seconds", async () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const view = renderSceneLayout(queryClient);

    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(getUnreadNotificationPreviewMock).toHaveBeenCalledTimes(1);
      getUnreadNotificationPreviewMock.mockClear();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(29_999);
      });
      expect(getUnreadNotificationPreviewMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(getUnreadNotificationPreviewMock).toHaveBeenCalledTimes(1);
      expect(getUnreadNotificationPreviewMock).toHaveBeenLastCalledWith({ limit: 20 });
    } finally {
      view.unmount();
      queryClient.clear();
      vi.useRealTimers();
    }
  });

  it("lets the main page scrollbar sit on the content edge", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    const { container } = renderSceneLayout(queryClient);
    const pageScroller = container.querySelector(".overflow-y-auto");

    expect(pageScroller).toHaveClass("overflow-x-hidden", "[scrollbar-gutter:auto]");
  });

  it("temporarily collapses an expanded desktop sidebar while the AI drawer is open", async () => {
    useAiChatStore.setState({ drawerOpen: true });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderSceneLayout(queryClient);

    expect(sidebarProviderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false, defaultOpen: false }),
    );
    expect(preferencesState.setSidebarOpen).not.toHaveBeenCalled();

    act(() => useAiChatStore.setState({ drawerOpen: false }));
    await waitFor(() => {
      expect(sidebarProviderSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ open: true, defaultOpen: true }),
      );
    });
    expect(preferencesState.setSidebarOpen).not.toHaveBeenCalled();
  });

  it("keeps a user-collapsed sidebar collapsed after the AI drawer closes", async () => {
    preferencesState.sidebarOpen = false;
    useAiChatStore.setState({ drawerOpen: true });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderSceneLayout(queryClient);

    expect(sidebarProviderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false, defaultOpen: false }),
    );

    act(() => useAiChatStore.setState({ drawerOpen: false }));
    await waitFor(() => {
      expect(sidebarProviderSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ open: false, defaultOpen: false }),
      );
    });
    expect(preferencesState.setSidebarOpen).not.toHaveBeenCalled();
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

  it("routes banner broadcasts to the global surface without creating a toast", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    queryClient.setQueryData(["notifications", "preview", authState.sessionVersion], {
      unreadCount: 0,
      items: [],
    });
    renderSceneLayout(queryClient);

    act(() => {
      queryClient.setQueryData(["notifications", "preview", authState.sessionVersion], {
        unreadCount: 1,
        items: [
          createNotification({
            id: "broadcast-banner",
            eventName: "system.broadcast",
            workspaceId: "00000000-0000-0000-0000-000000000000",
            campaignSurface: {
              campaignId: "campaign-banner",
              deliveryId: "delivery-banner",
              presentation: "banner",
              priority: 20,
              payload: {
                title: "Banner notice",
                body: "Banner body",
                action: null,
                dismissible: true,
              },
            },
          }),
        ],
      });
    });

    await waitFor(() => {
      expect(globalNotificationSurfacesSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ id: "broadcast-banner" })],
        }),
      );
    });
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it("persists a campaign toast click without pre-marking it as read", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["notifications", "preview", authState.sessionVersion], {
      unreadCount: 0,
      items: [],
    });
    renderSceneLayout(queryClient);

    const campaignActionTarget = {
      kind: "project",
      projectId: "project-1",
      destination: "website_releases",
    } satisfies NotificationItem["target"];
    const campaignToast = createNotification({
      id: "broadcast-toast",
      eventName: "system.broadcast",
      workspaceId: "00000000-0000-0000-0000-000000000000",
      campaignSurface: {
        campaignId: "campaign-toast",
        deliveryId: "delivery-toast",
        presentation: "toast",
        priority: 20,
        payload: {
          title: "Release ready",
          body: "Open the release notes for details.",
          action: {
            kind: "internal_route",
            label: "Review release",
            target: campaignActionTarget,
          },
        },
      },
    });
    act(() => {
      queryClient.setQueryData(["notifications", "preview", authState.sessionVersion], {
        unreadCount: 1,
        items: [campaignToast],
      });
    });

    await waitFor(() => expect(toastInfoMock).toHaveBeenCalledTimes(1));
    const toastContent = toastInfoMock.mock.calls[0]?.[0] as {
      title: ReactNode;
      description: ReactNode;
    };
    render(
      <>
        {toastContent.title}
        {toastContent.description}
      </>,
    );
    expect(screen.getByText("Release ready")).toBeInTheDocument();
    expect(screen.getByText("Open the release notes for details.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review release" }));

    await waitFor(() =>
      expect(openTargetMock).toHaveBeenCalledWith(campaignToast, {
        markRead: false,
        target: campaignActionTarget,
      }),
    );
    await waitFor(() => expect(recordInteractionMock).toHaveBeenCalledWith(campaignToast, "click"));
    expect(markReadMock).not.toHaveBeenCalledWith(campaignToast);
  });

  it("marks the main panel as the floating boundary and resizes the AI drawer when open", async () => {
    useAiChatStore.setState({ drawerOpen: true });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    const { container } = renderSceneLayout(queryClient);
    const sceneContainer = container.querySelector(".h-screen.min-h-0.w-full");
    if (!(sceneContainer instanceof HTMLElement)) {
      throw new Error("Missing scene container");
    }
    Object.defineProperty(sceneContainer, "clientWidth", {
      configurable: true,
      value: 960,
    });
    sceneContainer.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 960,
        top: 0,
        bottom: 720,
        width: 960,
        height: 720,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }) as DOMRect;

    const mainPanel = screen.getByTestId("admin-sidebar-shell").parentElement;
    expect(mainPanel).toHaveAttribute("data-floating-panel-boundary");

    const separator = screen.getByRole("button", {
      name: "ai:AI_CHAT_RESIZE",
    });
    expect(separator).toHaveAttribute("data-sidebar", "rail");
    expect(separator).toHaveAttribute("data-slot", "sidebar-rail");
    expect(separator).toHaveAttribute("tabindex", "-1");
    expect(separator).toHaveClass("hover:after:bg-sidebar-border");
    expect(separator).toHaveClass("-right-4");
    expect(aiDrawerOverlaySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ widthPx: 380, assistantAvailable: true }),
    );

    fireEvent(separator, createPointerEvent("pointerdown", { button: 0, clientX: 480 }));
    expect(document.body.style.cursor).toBe("col-resize");
    act(() => {
      window.dispatchEvent(createPointerEvent("pointermove", { clientX: 480 }));
    });

    expect(preferencesState.setAiDrawerWidthPx).toHaveBeenLastCalledWith(448);

    act(() => {
      window.dispatchEvent(createPointerEvent("pointermove", { clientX: 760 }));
    });
    expect(preferencesState.setAiDrawerWidthPx).toHaveBeenLastCalledWith(380);

    act(() => {
      window.dispatchEvent(createPointerEvent("pointerup", {}));
    });
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });
});
