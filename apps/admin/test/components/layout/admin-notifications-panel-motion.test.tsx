import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  const React = await import("react");

  function createMotionElement<T extends keyof React.JSX.IntrinsicElements>(tagName: T) {
    return React.forwardRef<
      HTMLElement,
      React.JSX.IntrinsicElements[T] & {
        variants?: Record<string, unknown>;
        initial?: unknown;
        animate?: unknown;
        exit?: unknown;
        whileTap?: unknown;
        transition?: unknown;
      }
    >(function MotionElement(
      {
        variants,
        initial,
        animate,
        exit,
        whileTap: _whileTap,
        transition: _transition,
        children,
        ...props
      },
      ref,
    ) {
      return React.createElement(
        tagName,
        {
          ...props,
          ref,
          "data-motion-initial": typeof initial === "string" ? initial : undefined,
          "data-motion-animate": typeof animate === "string" ? animate : undefined,
          "data-motion-exit": typeof exit === "string" ? exit : undefined,
          "data-motion-closed-x":
            typeof variants?.closed === "object" &&
            variants.closed &&
            "x" in variants.closed &&
            typeof variants.closed.x === "number"
              ? String(variants.closed.x)
              : undefined,
        },
        children,
      );
    });
  }

  const motion = new Proxy(
    {},
    {
      get(_target, property: string) {
        return createMotionElement(property as keyof React.JSX.IntrinsicElements);
      },
    },
  );

  return {
    ...actual,
    motion,
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
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
  listMyWorkspaces: vi.fn().mockResolvedValue({ items: [] }),
}));

import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { AdminNotificationsPanel } from "@/components/layout/admin-notifications-panel";

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>,
  );
}

describe("AdminNotificationsPanel motion", () => {
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("slides in from the right edge instead of the left", async () => {
    const { container } = renderPanel();

    await waitFor(() => {
      const panel = container.querySelector('[data-slot="admin-notifications-panel"]');
      expect(panel).toHaveAttribute("data-motion-closed-x", "16");
    });
  });
});
