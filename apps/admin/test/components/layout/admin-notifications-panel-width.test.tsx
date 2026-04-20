import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { AdminNotificationsPanel } from "@/components/layout/admin-notifications-panel";
import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";

const navigateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
  }),
}));

vi.mock("@/api/notifications", () => ({
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
  listMyWorkspaces: vi.fn().mockResolvedValue({
    items: [],
    switcher: {
      teams: [],
    },
    instanceSetup: { status: "ready", repairReason: null },
  }),
}));

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsScreenProvider>
        <ChromeTabsProvider
          labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
        >
          <AdminNotificationsPanel
            isPinned={false}
            onPinChange={() => undefined}
            onClose={() => undefined}
            className="w-fit max-w-full"
          />
        </ChromeTabsProvider>
      </SettingsScreenProvider>
    </QueryClientProvider>,
  );
}

describe("AdminNotificationsPanel width", () => {
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

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      writable: true,
    });

    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return this.classList.contains("inline-block") ? 432 : 0;
      },
    });

    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return this.classList.contains("inline-block") ? 320 : 0;
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("将面板宽度锁定为 tabs 行宽度，而不是内容区宽度", async () => {
    const { container } = renderPanel();
    const panel = container.querySelector('[data-slot="admin-notifications-panel"]');

    await waitFor(() => {
      expect(panel).toHaveStyle({ width: "432px" });
    });
  });
});
