import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState, type ReactNode } from "react";

import { RouteTransition } from "@/components/layout/route-transition";

const { startMock, stopMock, routerState } = vi.hoisted(() => ({
  startMock: vi.fn(),
  stopMock: vi.fn(),
  routerState: {
    isLoading: false,
    location: { pathname: "/projects/project-1/activity" },
    resolvedLocation: null as { pathname: string } | null,
    matches: [] as Array<{ status: string; routeId?: string }>,
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: () => "Loading" }),
}));

vi.mock("@arclayer/ui/page-skeleton", () => ({
  PageSkeleton: ({ variant }: { variant: string }) => (
    <div data-testid="route-pending-overlay" data-variant={variant} />
  ),
}));

describe("RouteTransition progress contract", () => {
  afterEach(() => {
    routerState.isLoading = false;
    routerState.location.pathname = "/projects/project-1/activity";
    routerState.resolvedLocation = null;
    routerState.matches = [];
    startMock.mockReset();
    stopMock.mockReset();
    vi.useRealTimers();
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

  it("waits for the default same-route pending delay before covering live content", () => {
    vi.useFakeTimers({ now: new Date("2026-08-02T00:00:00Z") });
    routerState.isLoading = true;
    const view = render(
      <RouteTransition>
        <div data-testid="route-content" />
      </RouteTransition>,
    );

    expect(screen.queryByTestId("route-pending-overlay")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(199));
    expect(screen.queryByTestId("route-pending-overlay")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("route-pending-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("route-content")).toBeInTheDocument();
    expect(screen.getByTestId("route-content").closest('[data-slot="route-content"]')).toHaveClass(
      "invisible",
    );

    view.unmount();
  });

  it("keeps a same-route pending view visible for the configured minimum duration", () => {
    vi.useFakeTimers({ now: new Date("2026-08-02T00:00:00Z") });
    routerState.isLoading = true;
    const view = render(
      <RouteTransition pendingMs={0}>
        <div data-testid="route-content" />
      </RouteTransition>,
    );

    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByTestId("route-pending-overlay")).toBeInTheDocument();

    routerState.isLoading = false;
    view.rerender(
      <RouteTransition pendingMs={0}>
        <div data-testid="route-content" />
      </RouteTransition>,
    );

    act(() => vi.advanceTimersByTime(179));
    expect(screen.getByTestId("route-pending-overlay")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("route-content")).toBeInTheDocument();
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
    routerState.matches = [{ status: "pending", routeId: "/projects/$projectId/settings/access" }];

    view.rerender(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="old-route-content" />
      </RouteTransition>,
    );

    expect(view.queryByTestId("old-route-content")).toBeInTheDocument();
    expect(
      view.queryByTestId("old-route-content")?.closest('[data-slot="route-content"]'),
    ).toHaveAttribute("inert");
    expect(screen.getByTestId("route-pending-overlay")).toBeInTheDocument();
    expect(view.container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });

  it("uses a route-specific pending fallback without rendering the generic page skeleton", () => {
    routerState.isLoading = true;
    routerState.location.pathname = "/login";
    routerState.resolvedLocation = { pathname: "/reset-password" };
    routerState.matches = [{ status: "pending", routeId: "/login" }];

    render(
      <RouteTransition pendingFallback={<div data-testid="auth-pending-fallback" />}>
        <div data-testid="old-route-content" />
      </RouteTransition>,
    );

    expect(screen.getByTestId("auth-pending-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("route-pending-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("bg-transparent");
  });

  it("covers stale route content when pathname advances before pending state", () => {
    const view = render(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="old-route-content" />
      </RouteTransition>,
    );

    routerState.location.pathname = "/projects/project-1/settings/access";
    routerState.resolvedLocation = { pathname: "/projects/project-1/settings/access" };
    routerState.matches = [{ status: "success", routeId: "/projects/$projectId/settings/access" }];

    view.rerender(
      <RouteTransition pendingMs={10_000}>
        <div data-testid="old-route-content" />
      </RouteTransition>,
    );

    expect(view.queryByTestId("old-route-content")).toBeInTheDocument();
    expect(
      view.queryByTestId("old-route-content")?.closest('[data-slot="route-content"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("route-pending-overlay")).toBeInTheDocument();
  });

  it("preserves child state and mount identity while the pending overlay is visible", () => {
    vi.useFakeTimers({ now: new Date("2026-08-02T00:00:00Z") });
    const mounted = vi.fn();

    function StatefulChild() {
      const [value, setValue] = useState("");
      useEffect(() => mounted(), []);
      return (
        <input
          aria-label="local draft"
          onChange={(event) => setValue(event.currentTarget.value)}
          value={value}
        />
      );
    }

    const view = render(
      <RouteTransition pendingMs={0}>
        <StatefulChild />
      </RouteTransition>,
    );
    fireEvent.change(screen.getByLabelText("local draft"), { target: { value: "keep me" } });

    routerState.isLoading = true;
    view.rerender(
      <RouteTransition pendingMs={0}>
        <StatefulChild />
      </RouteTransition>,
    );
    act(() => vi.advanceTimersByTime(0));

    expect(screen.getByLabelText("local draft")).toHaveValue("keep me");
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("route-pending-overlay")).toBeInTheDocument();
  });

  it.each([
    ["/projects/", "/projects", "card-grid"],
    ["/projects/$projectId/editor/", "/projects/project-1/editor", "split-detail"],
    ["/notifications/", "/notifications", "table"],
    ["/projects/$projectId/settings/general/", "/projects/project-1/settings/general", "form"],
  ])("uses the route macro layout for %s", (routeId, pathname, expectedVariant) => {
    vi.useFakeTimers();
    routerState.isLoading = true;
    routerState.location.pathname = pathname;
    routerState.matches = [{ status: "pending", routeId }];

    render(
      <RouteTransition pendingMs={0}>
        <div />
      </RouteTransition>,
    );
    act(() => vi.advanceTimersByTime(0));

    expect(screen.getByTestId("route-pending-overlay")).toHaveAttribute(
      "data-variant",
      expectedVariant,
    );
  });
});
