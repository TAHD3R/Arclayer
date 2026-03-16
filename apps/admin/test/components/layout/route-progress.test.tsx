import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteProgress } from "@/components/layout/route-progress";

const { startMock, stopMock, routerState } = vi.hoisted(() => ({
  startMock: vi.fn(),
  stopMock: vi.fn(),
  routerState: { isLoading: false },
}));

vi.mock("@bprogress/react", () => ({
  useProgress: () => ({
    start: startMock,
    stop: stopMock,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: { isLoading: boolean }) => boolean }) =>
    select(routerState),
}));

describe("RouteProgress", () => {
  afterEach(() => {
    routerState.isLoading = false;
    startMock.mockReset();
    stopMock.mockReset();
  });

  it("stops the shared progress bar when the hosting layout unmounts mid-load", () => {
    routerState.isLoading = true;

    const view = render(<RouteProgress />);

    expect(startMock).toHaveBeenCalledTimes(1);

    view.unmount();

    expect(stopMock).toHaveBeenCalledTimes(1);
  });
});
