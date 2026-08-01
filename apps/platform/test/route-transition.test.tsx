import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";

import { RouteTransition } from "@/components/route-transition";

const { routerState } = vi.hoisted(() => ({
  routerState: {
    isLoading: false,
    location: { pathname: "/monitoring/activity" },
    matches: [] as Array<{ status: string; routeId?: string }>,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: typeof routerState) => unknown }) =>
    select(routerState),
}));

vi.mock("@arclayer/ui/page-skeleton", () => ({
  PageSkeleton: ({ variant }: { variant: string }) => (
    <div data-testid="platform-route-pending" data-variant={variant} />
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: () => "Loading" }),
}));

describe("Platform RouteTransition", () => {
  afterEach(() => {
    routerState.isLoading = false;
    routerState.location.pathname = "/monitoring/activity";
    routerState.matches = [];
  });

  it("covers live content with an announced, busy table skeleton", () => {
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
    ).toHaveAttribute("inert");
    expect(screen.getByRole("status")).toContainElement(
      screen.getByTestId("platform-route-pending"),
    );
    expect(view.container.firstElementChild).toHaveAttribute("aria-busy", "true");
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

  it.each([
    ["/sign-in", "/sign-in", "form"],
    ["/_authenticated/", "/", "card-grid"],
    ["/_authenticated/attention", "/attention", "card-grid"],
    [
      "/_authenticated/access/team/invitations/$invitationId",
      "/access/team/invitations/invitation-1",
      "split-detail",
    ],
    ["/_authenticated/monitoring/activity", "/monitoring/activity", "table"],
  ])("uses the route macro layout for %s", (routeId, pathname, expectedVariant) => {
    routerState.isLoading = true;
    routerState.location.pathname = pathname;
    routerState.matches = [{ status: "pending", routeId }];

    render(
      <RouteTransition>
        <div />
      </RouteTransition>,
    );

    expect(screen.getByTestId("platform-route-pending")).toHaveAttribute(
      "data-variant",
      expectedVariant,
    );
  });
});
