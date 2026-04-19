import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProjectMembersPopover } from "@/pages/usercenter/projects/components/project-members-popover";
import { listProjectMembers } from "@/api/project-members";

vi.mock("@/api/project-members", () => ({
  listProjectMembers: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "common:ORG_WORKSPACES_MEMBERS_COUNT") {
        const count = typeof options?.count === "number" ? options.count : 0;
        return `${count} member${count === 1 ? "" : "s"}`;
      }
      return key;
    },
  }),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  };
}

describe("ProjectMembersPopover", () => {
  it("renders a single trigger with up to three preview avatars and overflow count", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);

    render(
      <ProjectMembersPopover
        project={{
          projectId: "project-1",
          memberCount: 5,
          membersPreview: [
            {
              userId: "user-1",
              username: "jackson",
              displayName: "Jackson Samuel",
              avatarUrl: null,
              email: "jackson@example.com",
            },
            {
              userId: "user-2",
              username: "ada",
              displayName: "Ada Lovelace",
              avatarUrl: null,
              email: "ada@example.com",
            },
            {
              userId: "user-3",
              username: "grace",
              displayName: "Grace Hopper",
              avatarUrl: null,
              email: "grace@example.com",
            },
            {
              userId: "user-4",
              username: "linus",
              displayName: "Linus Torvalds",
              avatarUrl: null,
              email: "linus@example.com",
            },
          ],
        }}
      />,
      { wrapper },
    );

    expect(screen.getByRole("button", { name: "5 members" })).toBeInTheDocument();
    expect(screen.getByLabelText("Jackson Samuel")).toBeInTheDocument();
    expect(screen.getByLabelText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByLabelText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByLabelText("Linus Torvalds")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("keeps the popover content within radix available viewport height", async () => {
    vi.mocked(listProjectMembers).mockResolvedValueOnce({
      items: [
        {
          id: "member-1",
          email: "jackson@example.com",
          username: "jackson",
          displayName: "Jackson Samuel",
          avatarUrl: null,
        },
      ],
      page: 1,
      size: 10,
      total: 1,
      pages: 1,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const wrapper = createWrapper(queryClient);

    render(
      <ProjectMembersPopover
        project={{
          projectId: "project-1",
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
        }}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole("button", { name: "1 member" }));

    const title = await screen.findByText("account:ACCOUNT_PROJECTS_MEMBERS_POPOVER_TITLE");
    const content = title.closest("[data-slot='popover-content']");
    expect(content).toHaveClass("max-h-(--radix-popover-content-available-height)");

    const scrollRegion = title.parentElement?.querySelector(".min-h-0.flex-1.overflow-auto");
    expect(scrollRegion).toBeTruthy();
  });
});
