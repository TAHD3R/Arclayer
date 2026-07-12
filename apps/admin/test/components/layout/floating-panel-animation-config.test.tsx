import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  const React = await import("react");

  function applyMotionTestProps(
    props: Record<string, unknown>,
    config: {
      layoutId?: string;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
    },
  ) {
    if (config.layoutId !== undefined) props["data-layout-id"] = config.layoutId;
    if (typeof config.initial === "string") props["data-motion-initial"] = config.initial;
    if (config.initial === false) props["data-motion-initial"] = "false";
    if (typeof config.animate === "string") props["data-motion-animate"] = config.animate;
    if (typeof config.exit === "string") props["data-motion-exit"] = config.exit;
  }

  function createMotionElement<T extends keyof React.JSX.IntrinsicElements>(tagName: T) {
    return React.forwardRef<
      HTMLElement,
      React.JSX.IntrinsicElements[T] & {
        layoutId?: string;
        initial?: unknown;
        animate?: unknown;
        exit?: unknown;
      }
    >(function MotionElement({ layoutId, initial, animate, exit, children, ...props }, ref) {
      const {
        whileTap: _whileTap,
        transition: _transition,
        variants: _variants,
        ...domProps
      } = props as Record<string, unknown>;
      const testProps: Record<string, unknown> = { ...domProps, ref };
      applyMotionTestProps(testProps, { layoutId, initial, animate, exit });

      return React.createElement(tagName, testProps, children);
    });
  }

  function createMotionComponent<ComponentProps extends object>(
    Component: React.ComponentType<ComponentProps>,
  ) {
    return React.forwardRef<
      HTMLElement,
      ComponentProps & {
        layoutId?: string;
        initial?: unknown;
        animate?: unknown;
        exit?: unknown;
      }
    >(function MotionComponent({ layoutId, initial, animate, exit, ...props }, ref) {
      const {
        whileTap: _whileTap,
        transition: _transition,
        variants: _variants,
        ...domProps
      } = props as Record<string, unknown>;
      const testProps = { ...domProps, ref };
      applyMotionTestProps(testProps, { layoutId, initial, animate, exit });
      return React.createElement(Component, testProps as ComponentProps);
    });
  }

  const motion = new Proxy(
    {
      create: createMotionComponent,
    },
    {
      get(target, property: string) {
        if (property in target) return target[property as keyof typeof target];
        return createMotionElement(property as keyof React.JSX.IntrinsicElements);
      },
    },
  );

  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    MotionConfig: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion,
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn().mockResolvedValue(undefined),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/projects/ws-alpha/assets" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/auth", () => ({
  me: vi.fn(),
}));

vi.mock("@/api/workspace-management", () => ({
  listWorkspaces: vi.fn(),
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: vi.fn(),
  getWorkspaceDetail: vi.fn(),
}));

vi.mock("@/components/ui/theme-transition", () => ({
  setThemePreferenceWithTransition: vi.fn().mockResolvedValue(undefined),
}));

import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import {
  computeFloatingPanelPosition,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
} from "@arclayer/ui/floating-panel";
import { SidebarProvider } from "@arclayer/ui/sidebar";
import * as authApi from "@/api/auth";
import { listWorkspaces } from "@/api/workspace-management";
import { getWorkspaceDetail, listMyWorkspaces } from "@/api/workspaces";
import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import { AdminScopeSwitcher } from "@/components/layout/admin-scope-switcher";
import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function renderWithProviders(node: React.ReactElement) {
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
        <SidebarProvider defaultOpen className="h-screen">
          <SettingsScreenProvider>{node}</SettingsScreenProvider>
        </SidebarProvider>
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

function FloatingPanelHarness() {
  return (
    <FloatingPanelRoot>
      <FloatingPanelTrigger title="Panel title">Open panel</FloatingPanelTrigger>
      <FloatingPanelContent showTitle={false}>
        <button type="button">Panel action</button>
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}

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
});

beforeEach(() => {
  vi.clearAllMocks();

  useAuthStore.setState({ accessToken: "token", sessionVersion: 1 });
  usePreferencesStore.setState({
    themePreference: "system",
    themeMode: "light",
    locale: "zh-CN",
    localePreference: null,
    localePreferenceMode: "workspace",
  });
  useWorkspaceStore.setState({
    currentWorkspaceId: "ws-alpha",
    currentProjectId: "project-alpha",
    lastWorkspaceId: "ws-alpha",
  });

  vi.mocked(authApi.me).mockResolvedValue({
    id: "user-1",
    username: "tester",
    email: "tester@example.com",
    displayName: "Tester",
  } as never);
  vi.mocked(listWorkspaces).mockResolvedValue({
    items: [
      {
        id: "workspace-link-1",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        project: { projectId: "project-alpha" },
        name: "Workspace Alpha",
        description: null,
        iconMode: "initials",
        iconColor: "#337ea9",
        iconGlyph: null,
        iconEmoji: null,
        iconUrl: null,
        isArchived: false,
        archivedAt: null,
        archivedByUserId: null,
        memberCount: 3,
        membersPreview: [],
        createdAt: "2026-01-01T00:00:00Z",
        enterable: true,
      },
    ],
    total: 1,
    page: 1,
    size: 20,
    pages: 1,
    next: null,
    prev: null,
  });
  vi.mocked(getWorkspaceDetail).mockResolvedValue({
    id: "ws-alpha",
    project: { projectId: "project-alpha" },
    name: "Workspace Alpha",
    kind: "team",
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
  });
  vi.mocked(listMyWorkspaces).mockResolvedValue({
    switcher: {
      teams: [
        {
          workspaceId: "ws-alpha",
          name: "Workspace Alpha",
          projectId: "project-alpha",
        },
      ],
    },
  } as never);
});

describe("floating panel animation config", () => {
  it("opens panel content from the hidden variant instead of skipping enter animation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FloatingPanelHarness />);

    await user.click(screen.getByRole("button", { name: "Open panel" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-motion-initial", "hidden");
    expect(dialog).toHaveAttribute("data-motion-animate", "visible");
    expect(dialog).toHaveAttribute("data-motion-exit", "hidden");
  });

  it("moves focus into the panel and restores it to the trigger when closed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FloatingPanelHarness />);

    const trigger = screen.getByRole("button", { name: "Open panel" });
    const focusSpy = vi.spyOn(trigger, "focus");
    await user.click(trigger);

    const panelAction = await screen.findByRole("button", { name: "Panel action" });
    expect(panelAction).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(focusSpy).toHaveBeenCalled();
    });
  });

  it("keeps the panel open when touch pointerup is followed by a delayed click", async () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<FloatingPanelHarness />);

      const trigger = screen.getByRole("button", { name: "Open panel" });
      fireEvent.pointerUp(trigger, { button: 0, pointerType: "touch" });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Panel action" })).toBeInTheDocument();

      vi.runAllTimers();
      fireEvent.click(trigger);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Panel action" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the panel open when mouse pointerup is followed by a delayed click", async () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<FloatingPanelHarness />);

      const trigger = screen.getByRole("button", { name: "Open panel" });
      fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Panel action" })).toBeInTheDocument();

      vi.advanceTimersByTime(300);
      fireEvent.click(trigger);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Panel action" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clamps panel placement inside the active floating panel boundary", () => {
    const position = computeFloatingPanelPosition({
      anchorRect: {
        left: 420,
        right: 480,
        top: 120,
        bottom: 152,
      },
      bounds: {
        left: 100,
        right: 500,
        top: 80,
        bottom: 620,
      },
      panelWidth: 280,
      panelHeight: 120,
      placement: "auto",
      offset: 8,
      viewportPadding: 12,
    });

    expect(position).toEqual({ left: 208, top: 160 });
  });

  it("disables shared layout morph on account menu and workspace switcher sidebar triggers", async () => {
    renderWithProviders(
      <>
        <AdminAccountMenu />
        <AdminScopeSwitcher />
      </>,
    );

    const accountTriggerText = await screen.findByText("Tester");
    const accountTrigger = accountTriggerText.closest("button");
    if (!accountTrigger) throw new Error("Missing account menu trigger");

    await waitFor(() => {
      expect(screen.getByText("Workspace Alpha")).toBeInTheDocument();
    });

    const workspaceTrigger = screen.getByRole("button", {
      name: "Workspace Alpha common:WORKSPACE_SWITCHER_SELECT_SCOPE",
    });

    expect(accountTrigger).not.toHaveAttribute("data-layout-id");
    expect(workspaceTrigger).not.toHaveAttribute("data-layout-id");
  });
});
