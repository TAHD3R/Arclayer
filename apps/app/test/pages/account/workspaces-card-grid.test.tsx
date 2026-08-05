import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspacesCardGrid } from "@/pages/usercenter/workspaces/components/workspaces-card-grid";

const useInfiniteQueryMock = vi.fn();
const useQueryMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => useInfiniteQueryMock(),
  useQuery: () => useQueryMock(),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: {
    wrapperSpacing?: string;
    loadingVariant?: string;
    className?: string;
    emptyExtra?: ReactNode;
    children?: ReactNode;
  }) => (
    <div
      data-testid="content-guard"
      data-wrapper-spacing={props.wrapperSpacing ?? ""}
      data-loading-variant={props.loadingVariant ?? ""}
      data-class-name={props.className ?? ""}
    >
      {props.emptyExtra ? (
        <div data-testid="content-guard-empty-extra">{props.emptyExtra}</div>
      ) : null}
      {props.children}
    </div>
  ),
}));

vi.mock("@/pages/usercenter/workspaces/components/workspace-card", () => ({
  WorkspaceCard: (props: { workspace: { name: string }; onClick?: () => void }) => (
    <div data-testid="workspace-card" data-clickable={props.onClick ? "yes" : "no"}>
      {props.workspace.name}
    </div>
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
    useQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });

    render(
      <WorkspacesCardGrid
        archived={false}
        searchInput=""
        buildMenuItems={() => []}
        editingWorkspaceId={null}
        editingWorkspaceField={null}
        editingWorkspaceName=""
        editingWorkspaceDescription=""
        onEditingWorkspaceNameChange={() => undefined}
        onEditingWorkspaceDescriptionChange={() => undefined}
        onCommitWorkspaceEdit={() => undefined}
        onCancelWorkspaceEdit={() => undefined}
        emptyTitle="Empty"
        emptyDescription="No workspaces"
        emptyExtra={<button type="button">Create workspace</button>}
        t={(key) => key}
      />,
    );

    expect(screen.getByTestId("content-guard")).toHaveAttribute("data-wrapper-spacing", "flush");
    expect(screen.getByTestId("content-guard")).toHaveAttribute(
      "data-loading-variant",
      "card-grid",
    );
    expect(screen.getByTestId("content-guard-empty-extra")).toHaveTextContent("Create workspace");
  });

  it("renders only the workspace cards in the active list", () => {
    useInfiniteQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        pages: [
          {
            items: [
              {
                id: "team-1",
                workspaceId: "team-1",
                slug: "alpha",
                name: "Workspace Alpha",
                description: null,
                iconMode: "initials",
                iconColor: "#337ea9",
                iconGlyph: null,
                iconEmoji: null,
                iconUrl: null,
                isArchived: false,
                archivedAt: null,
                archivedByUserId: null,
                memberCount: 2,
                membersPreview: [],
                createdAt: "2026-04-14T00:00:00Z",
                enterable: true,
              },
            ],
          },
        ],
      },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      isError: false,
    });
    useQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });

    render(
      <WorkspacesCardGrid
        archived={false}
        searchInput=""
        buildMenuItems={() => []}
        editingWorkspaceId={null}
        editingWorkspaceField={null}
        editingWorkspaceName=""
        editingWorkspaceDescription=""
        onEditingWorkspaceNameChange={() => undefined}
        onEditingWorkspaceDescriptionChange={() => undefined}
        onCommitWorkspaceEdit={() => undefined}
        onCancelWorkspaceEdit={() => undefined}
        emptyTitle="Empty"
        emptyDescription="No workspaces"
        t={(key) => key}
      />,
    );

    expect(screen.getAllByTestId("workspace-card").map((node) => node.textContent)).toEqual([
      "Workspace Alpha",
    ]);
  });

  it("suppresses card navigation while inline edit completion is settling", () => {
    useInfiniteQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        pages: [
          {
            items: [
              {
                id: "team-1",
                workspaceId: "team-1",
                slug: "alpha",
                name: "Workspace Alpha",
                description: "Primary workspace",
                iconMode: "initials",
                iconColor: "#337ea9",
                iconGlyph: null,
                iconEmoji: null,
                iconUrl: null,
                isArchived: false,
                archivedAt: null,
                archivedByUserId: null,
                memberCount: 2,
                membersPreview: [],
                createdAt: "2026-04-14T00:00:00Z",
                enterable: true,
              },
            ],
          },
        ],
      },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      isError: false,
    });
    useQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });

    render(
      <WorkspacesCardGrid
        archived={false}
        searchInput=""
        buildMenuItems={() => []}
        editingWorkspaceId={null}
        editingWorkspaceField={null}
        editingWorkspaceName=""
        editingWorkspaceDescription=""
        onEditingWorkspaceNameChange={() => undefined}
        onEditingWorkspaceDescriptionChange={() => undefined}
        onCommitWorkspaceEdit={() => undefined}
        onCancelWorkspaceEdit={() => undefined}
        disableWorkspaceNavigation
        onCardClick={() => undefined}
        emptyTitle="Empty"
        emptyDescription="No workspaces"
        t={(key) => key}
      />,
    );

    expect(screen.getByTestId("workspace-card")).toHaveAttribute("data-clickable", "no");
  });

  it("appends the create-workspace card after existing workspace cards", () => {
    useInfiniteQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        pages: [
          {
            items: [
              {
                id: "team-1",
                workspaceId: "team-1",
                slug: "alpha",
                name: "Workspace Alpha",
                description: "Primary workspace",
                iconMode: "initials",
                iconColor: "#337ea9",
                iconGlyph: null,
                iconEmoji: null,
                iconUrl: null,
                isArchived: false,
                archivedAt: null,
                archivedByUserId: null,
                memberCount: 2,
                membersPreview: [],
                createdAt: "2026-04-14T00:00:00Z",
                enterable: true,
              },
            ],
          },
        ],
      },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      isError: false,
    });
    useQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });

    render(
      <WorkspacesCardGrid
        archived={false}
        searchInput=""
        buildMenuItems={() => []}
        editingWorkspaceId={null}
        editingWorkspaceField={null}
        editingWorkspaceName=""
        editingWorkspaceDescription=""
        onEditingWorkspaceNameChange={() => undefined}
        onEditingWorkspaceDescriptionChange={() => undefined}
        onCommitWorkspaceEdit={() => undefined}
        onCancelWorkspaceEdit={() => undefined}
        emptyTitle="Empty"
        emptyDescription="No workspaces"
        appendCard={<button type="button">Create workspace card</button>}
        t={(key) => key}
      />,
    );

    expect(screen.getByText("Create workspace card")).toBeInTheDocument();
    expect(screen.getAllByTestId("workspace-card")).toHaveLength(1);
  });
});
