import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren, ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectCard } from "@/pages/usercenter/projects/components/project-card";
import { useFavoritesStore } from "@/stores/use-favorites-store";

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactElement }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  };
}

describe("ProjectCard", () => {
  beforeEach(() => {
    useFavoritesStore.setState({ paths: [], items: [], sectionExpanded: false });
  });

  it("favorites the project overview path without triggering the card click handler", () => {
    const handleClick = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);

    render(
      <ProjectCard
        project={{
          id: "project-1",
          projectId: "project-1",
          organizationId: "org-1",
          workspaceId: "workspace-1",
          slug: "launchpad",
          name: "Launchpad",
          description: "Project overview",
          iconMode: "initials",
          iconColor: "#337ea9",
          iconGlyph: null,
          iconEmoji: null,
          iconUrl: null,
          isArchived: false,
          archivedAt: null,
          archivedByUserId: null,
          createdAt: "2026-04-19T00:00:00Z",
          memberCount: 1,
          membersPreview: [
            {
              userId: "user-1",
              username: "jackson",
              displayName: "Jackson Samuel",
              avatarUrl: null,
              email: "jackson@example.com",
            },
          ],
          enterable: true,
          primaryRuntime: null,
        }}
        menuItems={[]}
        t={(key, options) => {
          if (key === "common:FAVORITE_ADD") return "Add to favorites";
          if (key === "common:FAVORITE_ADD_TOOLTIP") return "Add this project";
          if (key === "common:FAVORITE_REMOVE") return "Remove from favorites";
          if (key === "common:FAVORITE_REMOVE_TOOLTIP") return "Remove this project";
          if (key === "common:ORG_WORKSPACES_MEMBERS_COUNT") {
            const count = typeof options?.count === "number" ? options.count : 0;
            return `${count} member${count === 1 ? "" : "s"}`;
          }
          return key;
        }}
        editing={false}
        editingField={null}
        editingName="Launchpad"
        editingDescription="Project overview"
        onEditingNameChange={() => undefined}
        onEditingDescriptionChange={() => undefined}
        onCommitName={() => undefined}
        onCommitDescription={() => undefined}
        onCancelEdit={() => undefined}
        onClick={handleClick}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to favorites" }));

    expect(useFavoritesStore.getState().paths).toContain("/projects/project-1");
    expect(handleClick).not.toHaveBeenCalled();
  });
});
