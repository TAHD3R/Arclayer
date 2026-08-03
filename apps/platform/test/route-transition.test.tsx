import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";

import { RouteTransition } from "@/components/route-transition";

const { progress, routerState } = vi.hoisted(() => ({
  progress: {
    start: vi.fn(),
    stop: vi.fn(),
  },
  routerState: {
    isLoading: false,
    location: { pathname: "/monitoring/activity" },
    resolvedLocation: { pathname: "/monitoring/activity" },
    matches: [] as Array<{ status: string; routeId?: string }>,
  },
}));

vi.mock("@bprogress/react", () => ({
  useProgress: () => progress,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: typeof routerState) => unknown }) =>
    select(routerState),
}));

describe("Platform RouteTransition", () => {
  afterEach(() => {
    progress.start.mockReset();
    progress.stop.mockReset();
    routerState.isLoading = false;
    routerState.location.pathname = "/monitoring/activity";
    routerState.resolvedLocation.pathname = "/monitoring/activity";
    routerState.matches = [];
  });

  it("keeps live content visible while route progress is active", () => {
    const view = render(
      <RouteTransition>
        <div data-testid="platform-route-content" />
      </RouteTransition>,
    );

    expect(screen.getByTestId("platform-route-content")).toBeInTheDocument();
    expect(view.container.firstElementChild).toHaveAttribute("aria-busy", "false");

    routerState.isLoading = true;
    view.rerender(
      <RouteTransition>
        <div data-testid="platform-route-content" />
      </RouteTransition>,
    );

    expect(screen.queryByTestId("platform-route-content")).toBeInTheDocument();
    expect(
      screen.getByTestId("platform-route-content").closest('[data-slot="route-content"]'),
    ).toBeVisible();
    expect(view.container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(progress.start).toHaveBeenCalledTimes(1);

    routerState.isLoading = false;
    view.rerender(
      <RouteTransition>
        <div data-testid="platform-route-content" />
      </RouteTransition>,
    );

    expect(progress.stop).toHaveBeenCalledTimes(1);
  });

  it("preserves child state and mount identity while pending", () => {
    const mounted = vi.fn();

    function StatefulChild() {
      const [value, setValue] = useState("");
      useEffect(() => mounted(), []);
      return (
        <input
          aria-label="platform local draft"
          onChange={(event) => setValue(event.currentTarget.value)}
          value={value}
        />
      );
    }

    const view = render(
      <RouteTransition>
        <StatefulChild />
      </RouteTransition>,
    );
    fireEvent.change(screen.getByLabelText("platform local draft"), {
      target: { value: "keep me" },
    });

    routerState.isLoading = true;
    view.rerender(
      <RouteTransition>
        <StatefulChild />
      </RouteTransition>,
    );

    expect(screen.getByLabelText("platform local draft")).toHaveValue("keep me");
    expect(mounted).toHaveBeenCalledTimes(1);
  });
});
