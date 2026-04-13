import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspacesCardGrid } from "@/pages/usercenter/workspaces/components/workspaces-card-grid";

const useInfiniteQueryMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => useInfiniteQueryMock(),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: { wrapperSpacing?: string; className?: string }) => (
    <div
      data-testid="content-guard"
      data-wrapper-spacing={props.wrapperSpacing ?? ""}
      data-class-name={props.className ?? ""}
    />
  ),
}));

describe("WorkspacesCardGrid", () => {
  it("uses the shared flush content-guard spacing for empty or error states", () => {
    useInfiniteQueryMock.mockReturnValue({
      isLoading: false,
      error: { message: "forbidden" },
      refetch: vi.fn(),
      data: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      isError: true,
    });

    render(
      <WorkspacesCardGrid
        archived={false}
        searchInput=""
        buildMenuItems={() => []}
        emptyTitle="Empty"
        emptyDescription="No workspaces"
        t={(key) => key}
      />,
    );

    expect(screen.getByTestId("content-guard")).toHaveAttribute("data-wrapper-spacing", "flush");
  });
});
