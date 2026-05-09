import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InviteLinkParticipantsPopover } from "@/pages/workspaces/team/shared/components/invite-link-participants-popover";
import { listTeamInviteLinkParticipants } from "@/api/team";

vi.mock("@/api/team", () => ({
  listTeamInviteLinkParticipants: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined, opts?: { emptyValue?: string }) =>
      value || opts?.emptyValue || "-",
  }),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe("InviteLinkParticipantsPopover", () => {
  it("passes debounced search query to workspace participant API", async () => {
    vi.mocked(listTeamInviteLinkParticipants).mockResolvedValue({
      items: [
        {
          usedAt: "2026-04-22T00:00:00.000Z",
          user: {
            userId: "user-1",
            username: "ada",
            email: "ada@example.com",
            displayName: "Ada Lovelace",
            avatarUrl: null,
          },
        },
      ],
      page: 1,
      size: 10,
      total: 1,
      pages: 1,
      next: null,
      prev: null,
    });

    const user = userEvent.setup();
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <InviteLinkParticipantsPopover
          workspaceId="workspace-1"
          linkId="link-1"
          usesCount={1}
          primaryUser={{
            userId: "user-1",
            username: "ada",
            email: "ada@example.com",
            displayName: "Ada Lovelace",
            avatarUrl: null,
          }}
          lastUsedAt="2026-04-22T00:00:00.000Z"
        />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "team:TEAM_INVITE_LINKS_ACTION_VIEW_PARTICIPANTS",
      }),
    );

    await waitFor(() => {
      expect(listTeamInviteLinkParticipants).toHaveBeenCalledWith("workspace-1", "link-1", {
        page: 1,
        size: 10,
        q: "",
      });
    });

    await user.type(
      screen.getByPlaceholderText("team:TEAM_INVITE_LINKS_PARTICIPANT_SEARCH_PLACEHOLDER"),
      "ada",
    );

    await waitFor(
      () => {
        expect(listTeamInviteLinkParticipants).toHaveBeenLastCalledWith("workspace-1", "link-1", {
          page: 1,
          size: 10,
          q: "ada",
        });
      },
      { timeout: 1500 },
    );
  });
});
