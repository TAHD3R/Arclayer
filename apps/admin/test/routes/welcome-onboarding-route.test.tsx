import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { redirectMock, resolvePostAuthRouteMock, routeState } = vi.hoisted(() => ({
  redirectMock: vi.fn((payload: unknown) => payload),
  resolvePostAuthRouteMock: vi.fn(async () => ({
    path: "/welcome",
    workspaceId: null,
    projectId: null,
    onboardingRequired: true,
  })),
  routeState: {
    pathname: "/projects",
    isPagePending: false,
  },
}));

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
  SceneLoadingOverlay: () => null,
}));
vi.mock("@/components/layout/usercenter-overlay-host", () => ({
  UsercenterOverlayHost: () => null,
}));
vi.mock("@/lib/routing/scene-registry", () => ({
  resolveSceneKey: () => "global",
  getSceneLayout: () => (props: { children: React.ReactNode }) => (
    <div data-testid="scene-layout">{props.children}</div>
  ),
}));
vi.mock("@arclayer/hooks/use-scene-reveal-transition", () => ({
  useSceneRevealTransition: () => ({ displayedScene: "global", overlayVisible: false }),
}));
vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: { reduceMotion: boolean }) => unknown) =>
    selector({ reduceMotion: false }),
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
      setCurrentContext: vi.fn(),
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
  it("renders /welcome without the Admin scene layout", () => {
    routeState.pathname = "/welcome";

    render(<RootLayout />);

    expect(screen.getByTestId("route-outlet")).toBeInTheDocument();
    expect(screen.queryByTestId("scene-layout")).not.toBeInTheDocument();
    expect(screen.queryByTestId("root-scene-shell")).not.toBeInTheDocument();
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
});
