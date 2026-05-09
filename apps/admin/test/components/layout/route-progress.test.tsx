import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { RouteTransition } from "@/components/layout/route-transition";

const { startMock, stopMock, routerState } = vi.hoisted(() => ({
  startMock: vi.fn(),
  stopMock: vi.fn(),
  routerState: {
    isLoading: false,
    location: { pathname: "/projects/project-1/activity" },
    resolvedLocation: null as { pathname: string } | null,
    matches: [] as Array<{ status: string }>,
  },
}));

vi.mock("@bprogress/react", () => ({
  useProgress: () => ({
    start: startMock,
    stop: stopMock,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: typeof routerState) => boolean | Record<string, unknown>;
  }) => select(routerState),
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  MotionConfig: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...rest }: { children?: ReactNode } & Record<string, unknown>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

vi.mock("@/hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => false,
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({ children }: { children?: ReactNode }) => (
    <div data-testid="route-pending-overlay">{children}</div>
  ),
}));

vi.mock("@arclayer/ui/skeleton", () => ({
  Skeleton: (props: Record<string, unknown>) => <div {...props} />,
}));

describe("RouteTransition progress contract", () => {
  afterEach(() => {
    routerState.isLoading = false;
    routerState.location.pathname = "/projects/project-1/activity";
    routerState.resolvedLocation = null;
    routerState.matches = [];
    startMock.mockReset();
    stopMock.mockReset();
  });

  it("starts and stops the shared progress bar with route loading state", () => {
    routerState.isLoading = true;
    const view = render(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="route-content" />
      </RouteTransition>,
    );

    expect(startMock).toHaveBeenCalledTimes(1);

    routerState.isLoading = false;
    view.rerender(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="route-content" />
      </RouteTransition>,
    );

    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it("stops the shared progress bar when the hosting layout unmounts mid-load", () => {
    routerState.isLoading = true;

    const view = render(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="route-content" />
      </RouteTransition>,
    );

    expect(startMock).toHaveBeenCalledTimes(1);

    view.unmount();

    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it("covers stale route content immediately while cross-route loading is pending", () => {
    const view = render(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="old-route-content" />
      </RouteTransition>,
    );

    routerState.isLoading = true;
    routerState.location.pathname = "/projects/project-1/settings/access";
    routerState.resolvedLocation = { pathname: "/projects/project-1/activity" };

    view.rerender(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="old-route-content" />
      </RouteTransition>,
    );

    expect(view.getByTestId("old-route-content")).toBeInTheDocument();
    expect(screen.getByTestId("route-pending-overlay")).toBeInTheDocument();
  });

  it("covers stale route content when pathname advances before pending state", () => {
    const view = render(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="old-route-content" />
      </RouteTransition>,
    );

    routerState.location.pathname = "/projects/project-1/settings/access";
    routerState.resolvedLocation = { pathname: "/projects/project-1/settings/access" };

    view.rerender(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="old-route-content" />
      </RouteTransition>,
    );

    expect(view.getByTestId("old-route-content")).toBeInTheDocument();
    expect(screen.getByTestId("route-pending-overlay")).toBeInTheDocument();
  });
});
