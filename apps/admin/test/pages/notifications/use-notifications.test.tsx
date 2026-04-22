import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNotifications } from "@/pages/notifications/hooks/use-notifications";

const { listNotificationsMock, listMyWorkspacesMock, seedDemoNotificationsMock } = vi.hoisted(
  () => ({
    listNotificationsMock: vi.fn(),
    listMyWorkspacesMock: vi.fn(),
    seedDemoNotificationsMock: vi.fn(),
  }),
);

vi.mock("@/api/notifications", () => ({
  archiveNotification: vi.fn(),
  deleteNotification: vi.fn(),
  listNotifications: (...args: unknown[]) => listNotificationsMock(...args),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  seedDemoNotifications: (...args: unknown[]) => seedDemoNotificationsMock(...args),
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: (...args: unknown[]) => listMyWorkspacesMock(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
  }),
}));

vi.mock("@/components/layout/settings-screen-provider", () => ({
  useSettingsScreen: () => ({
    openSettings: vi.fn(),
  }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyErrorText: vi.fn(),
}));

vi.mock("@/lib/routing/notification-target", () => ({
  resolveNotificationTarget: vi.fn(() => null),
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: { currentWorkspaceId: string | null }) => unknown) =>
    selector({ currentWorkspaceId: "ws-1" }),
}));

vi.mock("@arclayer/hooks/use-now-tick", () => ({
  useNowTick: () => 0,
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  };
}

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMyWorkspacesMock.mockResolvedValue({ items: [] });
    listNotificationsMock.mockResolvedValue({
      items: [],
      next: null,
      page: 1,
      size: 20,
      total: 0,
    });
    seedDemoNotificationsMock.mockResolvedValue({ createdCount: 12 });
  });

  it("invalidates the whole notifications query domain after seeding demo updates", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.listQuery.isSuccess).toBe(true);
    });

    await act(async () => {
      await result.current.seedDemo();
    });

    expect(seedDemoNotificationsMock).toHaveBeenCalledWith("ws-1", { count: 12 });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });
});
