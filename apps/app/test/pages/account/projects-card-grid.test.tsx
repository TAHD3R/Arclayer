import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProjectsCardGrid } from "@/pages/usercenter/projects/components/projects-card-grid";

const useInfiniteQueryMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => useInfiniteQueryMock(),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: { loadingVariant?: string; children?: ReactNode }) => (
    <div data-loading-variant={props.loadingVariant ?? ""} data-testid="content-guard">
      {props.children}
    </div>
  ),
}));

describe("ProjectsCardGrid", () => {
  it("uses the card-grid skeleton for its initial loading state", () => {
    useInfiniteQueryMock.mockReturnValue({
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      data: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      isError: false,
    });

    render(
      <ProjectsCardGrid
        workspaceId="workspace-1"
        archived={false}
        searchInput=""
        buildMenuItems={() => []}
        editingProjectId={null}
        editingProjectField={null}
        editingProjectName=""
        editingProjectDescription=""
        onEditingProjectNameChange={() => undefined}
        onEditingProjectDescriptionChange={() => undefined}
        onCommitProjectEdit={() => undefined}
        onCancelProjectEdit={() => undefined}
        emptyTitle="Empty"
        emptyDescription="No projects"
        t={(key) => key}
      />,
    );

    expect(screen.getByTestId("content-guard")).toHaveAttribute(
      "data-loading-variant",
      "card-grid",
    );
  });
});
