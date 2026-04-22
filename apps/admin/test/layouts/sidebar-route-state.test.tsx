import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { AdminLayout } from "@/layouts/admin-layout";
import { getWorkspaceDetail } from "@/api/workspaces";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useSidebar } from "@arclayer/ui/sidebar";

let mockPathname = "/projects/ws-1/content/create";
let mockSearchObject: Record<string, unknown> = {};
let mockSearchStr = "";
const navigateMock = vi.fn().mockResolvedValue(undefined);
const capturedSceneProps: Array<Record<string, unknown>> = [];

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => null,
  useNavigate: () => navigateMock,
  useRouterState: ({
    select,
  }: {
    select: (state: {
      location: {
        pathname: string;
        search: Record<string, unknown>;
        searchStr: string;
      };
    }) => unknown;
  }) =>
    select({
      location: {
        pathname: mockPathname,
        search: mockSearchObject,
        searchStr: mockSearchStr,
      },
    }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/hooks/use-system-runtime", () => ({
  useSystemRuntime: () => ({
    runtime: {
      capabilities: {
        deploymentSettingsEnabled: true,
        publicRegisterEnabled: false,
      },
    },
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

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDetail: vi.fn(),
}));

vi.mock("@/layouts/admin-scene-layout", () => ({
  AdminSceneLayout: (props: Record<string, unknown> & { children?: ReactNode }) => {
    capturedSceneProps.push(props);
    return <div data-testid="scene-layout">{props.children}</div>;
  },
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

function renderWithQueryClient(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

function latestSceneProps() {
  const latest = capturedSceneProps.at(-1);
  expect(latest).toBeDefined();
  return latest as {
    mainItems: Array<{ key: string }>;
    favoriteWorkspaceBase?: string | null;
    sidebarPathnameOverride?: string;
    loading?: boolean;
  };
}

function SidebarConsumerProbe() {
  const sidebar = useSidebar();
  return (
    <div
      data-testid="sidebar-probe"
      data-layout-state={sidebar.layoutState}
      data-visual-state={sidebar.state}
    >
      {sidebar.state}
    </div>
  );
}

describe("sidebar route state wiring", () => {
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
    capturedSceneProps.length = 0;
    navigateMock.mockClear();
    mockPathname = "/projects/ws-1/content/create";
    mockSearchObject = {};
    mockSearchStr = "";
    useAuthStore.setState({ accessToken: null, sessionVersion: 0 });
    usePreferencesStore.setState({
      localePreferenceMode: "browser",
      setEffectiveLocale: vi.fn(),
      cacheWorkspaceLocale: vi.fn(),
    });
    useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "workspace-1",
      organizationId: "org-1",
    } as Awaited<ReturnType<typeof getWorkspaceDetail>>);
  });

  it("derives workspace sidebar items from the pathname even before workspace store hydration", () => {
    renderWithQueryClient(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );

    const props = latestSceneProps();

    expect(screen.getByTestId("scene-layout")).toBeInTheDocument();
    expect(props.favoriteWorkspaceBase).toBe("/projects/ws-1");
    expect(props.mainItems.map((item) => item.key)).toEqual([
      "dashboard",
      "website",
      "analytics",
      "apps",
      "automations",
      "activity",
      "settings.project",
    ]);
  });

  it("keeps the project shell visible while workspace detail is still loading", () => {
    vi.mocked(getWorkspaceDetail).mockImplementation(
      () => new Promise(() => undefined) as ReturnType<typeof getWorkspaceDetail>,
    );
    useAuthStore.setState({ accessToken: "token", sessionVersion: 1 });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      currentProjectId: "ws-1",
    });

    renderWithQueryClient(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );

    const props = latestSceneProps();

    expect(screen.getByTestId("scene-layout")).toBeInTheDocument();
    expect(props.favoriteWorkspaceBase).toBe("/projects/ws-1");
    expect(props.loading).toBe(false);
  });

  it("renders route content without the admin scene shell in favorite overlay content-only mode", () => {
    mockSearchStr = "?arclayer_favorite_overlay=content-only";

    renderWithQueryClient(
      <AdminLayout>
        <div data-testid="embedded-route-content">
          embedded content
          <SidebarConsumerProbe />
        </div>
      </AdminLayout>,
    );

    expect(screen.queryByTestId("scene-layout")).not.toBeInTheDocument();
    expect(screen.getByTestId("embedded-route-content")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-probe")).toHaveTextContent("expanded");
    expect(screen.getByTestId("sidebar-probe")).toHaveAttribute("data-layout-state", "expanded");
  });
});
