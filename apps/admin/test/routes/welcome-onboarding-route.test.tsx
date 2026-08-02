import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, resolvePostAuthRouteMock, routeState, setCurrentContextMock } = vi.hoisted(
  () => ({
    redirectMock: vi.fn((payload: unknown) => payload),
    resolvePostAuthRouteMock: vi.fn(async () => ({
      path: "/welcome",
      workspaceId: null as string | null,
      projectId: null as string | null,
      onboardingRequired: true,
    })),
    routeState: {
      pathname: "/projects",
      isPagePending: false,
    },
    setCurrentContextMock: vi.fn(),
  }),
);

vi.mock("@tanstack/react-router", () => ({
  createRootRoute: (config: unknown) => config,
  Outlet: () => <div data-testid="route-outlet" />,
  redirect: redirectMock,
  useRouterState: () => routeState,
}));

vi.mock("@/components/builtin/route-document-title-manager", () => ({
  RouteDocumentTitleManager: () => null,
}));
vi.mock("@/components/layout/scene-loading-overlay", () => ({
  SceneLoadingOverlay: (props: { visible: boolean }) => (
    <div data-testid="scene-loading-overlay" data-visible={props.visible ? "true" : "false"} />
  ),
}));
vi.mock("@/components/layout/usercenter-overlay-host", () => ({
  UsercenterOverlayHost: () => null,
}));
vi.mock("@/components/builtin/access-restriction-boundary", () => ({
  AccessRestrictionBoundary: (props: { children: React.ReactNode }) => props.children,
}));
vi.mock("@/lib/routing/scene-registry", () => ({
  resolveSceneKey: (pathname: string) => {
    if (pathname.startsWith("/login")) return "auth";
    if (pathname.startsWith("/projects/")) return "admin";
    return "global";
  },
  getSceneLayout: (sceneKey: string) => (props: { children: React.ReactNode }) => (
    <div data-testid={`scene-layout-${sceneKey}`}>{props.children}</div>
  ),
}));
vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: {
    getState: () => ({ accessToken: "token" }),
  },
}));
vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: {
    getState: () => ({
      lastWorkspaceId: null,
      setCurrentContext: setCurrentContextMock,
    }),
  },
}));
vi.mock("@/lib/routing/post-auth-routing", () => ({
  resolvePostAuthRoute: resolvePostAuthRouteMock,
}));

import { RootLayout, Route } from "@/routes/__root";

const rootRouteConfig = Route as unknown as {
  beforeLoad: (context: {
    location: {
      pathname: string;
      searchStr: string;
      search: Record<string, unknown>;
    };
  }) => Promise<void>;
};

describe("welcome onboarding route guard", () => {
  beforeEach(() => {
    routeState.pathname = "/projects";
    routeState.isPagePending = false;
    redirectMock.mockClear();
    resolvePostAuthRouteMock.mockReset();
    resolvePostAuthRouteMock.mockResolvedValue({
      path: "/welcome",
      workspaceId: null,
      projectId: null,
      onboardingRequired: true,
    });
    setCurrentContextMock.mockReset();
  });

  it("renders /welcome without the Admin scene layout", () => {
    routeState.pathname = "/welcome";

    render(<RootLayout />);

    expect(screen.getByTestId("route-outlet")).toBeInTheDocument();
    expect(screen.queryByTestId("scene-layout-global")).not.toBeInTheDocument();
    expect(screen.queryByTestId("root-scene-shell")).not.toBeInTheDocument();
  });

  it("uses the current scene layout immediately when the pathname changes", () => {
    const { rerender } = render(<RootLayout />);

    expect(screen.getByTestId("scene-layout-global")).toBeInTheDocument();

    routeState.pathname = "/projects/project_1";
    routeState.isPagePending = true;
    rerender(<RootLayout />);

    expect(screen.queryByTestId("scene-layout-global")).not.toBeInTheDocument();
    expect(screen.getByTestId("scene-layout-admin")).toBeInTheDocument();
  });

  it("only shows the root scene overlay for pending cross-fullscreen scene switches", () => {
    const { rerender } = render(<RootLayout />);

    routeState.isPagePending = true;
    rerender(<RootLayout />);

    expect(screen.getByTestId("scene-loading-overlay")).toHaveAttribute("data-visible", "false");

    routeState.pathname = "/login";
    rerender(<RootLayout />);

    expect(screen.getByTestId("scene-loading-overlay")).toHaveAttribute("data-visible", "true");
  });

  it("redirects onboarding-required business pages to /welcome", async () => {
    routeState.pathname = "/projects";
    resolvePostAuthRouteMock.mockClear();

    await expect(
      rootRouteConfig.beforeLoad({
        location: {
          pathname: "/projects",
          searchStr: "",
          search: {},
        },
      }),
    ).rejects.toEqual({ to: "/welcome" });

    expect(redirectMock).toHaveBeenCalledWith({ to: "/welcome" });
    expect(setCurrentContextMock).toHaveBeenCalledWith({
      workspaceId: null,
      projectId: null,
    });
  });

  it("hydrates the current context from the server-validated post-auth decision", async () => {
    resolvePostAuthRouteMock.mockResolvedValueOnce({
      path: "/",
      workspaceId: "workspace-current",
      projectId: "project-current",
      onboardingRequired: false,
    });

    await expect(
      rootRouteConfig.beforeLoad({
        location: {
          pathname: "/",
          searchStr: "",
          search: {},
        },
      }),
    ).resolves.toBeUndefined();

    expect(setCurrentContextMock).toHaveBeenCalledWith({
      workspaceId: "workspace-current",
      projectId: "project-current",
    });
  });

  it("keeps dev dry-run welcome local after auth without post-auth routing", async () => {
    routeState.pathname = "/welcome";
    redirectMock.mockClear();
    resolvePostAuthRouteMock.mockClear();

    await expect(
      rootRouteConfig.beforeLoad({
        location: {
          pathname: "/welcome",
          searchStr: "?dryRun=1",
          search: { dryRun: "1" },
        },
      }),
    ).resolves.toBeUndefined();

    expect(resolvePostAuthRouteMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalledWith({ to: "/welcome" });
  });

  it("keeps invitation onboarding local after auth without consuming its redirect", async () => {
    routeState.pathname = "/welcome";
    redirectMock.mockClear();
    resolvePostAuthRouteMock.mockClear();

    await expect(
      rootRouteConfig.beforeLoad({
        location: {
          pathname: "/welcome",
          searchStr: "?mode=invitation&redirect=%2Fprojects%2Fproject-invite",
          search: { mode: "invitation", redirect: "/projects/project-invite" },
        },
      }),
    ).resolves.toBeUndefined();

    expect(resolvePostAuthRouteMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("preserves the original destination when login must continue through onboarding", async () => {
    routeState.pathname = "/login";
    redirectMock.mockClear();
    resolvePostAuthRouteMock.mockResolvedValueOnce({
      path: "/welcome",
      workspaceId: null,
      projectId: null,
      onboardingRequired: true,
    });

    await expect(
      rootRouteConfig.beforeLoad({
        location: {
          pathname: "/login",
          searchStr: "?redirect=%2Fprojects%2Fproject-invite",
          search: { redirect: "/projects/project-invite" },
        },
      }),
    ).rejects.toEqual({
      to: "/welcome",
      search: { redirect: "/projects/project-invite" },
    });

    expect(redirectMock).toHaveBeenCalledWith({
      to: "/welcome",
      search: { redirect: "/projects/project-invite" },
    });
  });
});
