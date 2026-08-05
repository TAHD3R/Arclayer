import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TeamMemberCreditUsageCell } from "@/pages/workspaces/team/members/components/team-member-credit-usage-cell";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

const usage = {
  membershipId: "member-1",
  user: { userId: "user-1", username: "alice" },
  isOwner: false,
  effectiveLimit: { limitKind: "limited" as const, limitCredits: 1_000 },
  reservedCredits: 25,
  committedCredits: 250,
  availableCredits: 725,
};

describe("TeamMemberCreditUsageCell", () => {
  it("renders committed, reserved, and available current-period Credits", () => {
    render(<TeamMemberCreditUsageCell usage={usage} loading={false} />);

    expect(screen.getByText("250")).toHaveClass("tabular-nums");
    expect(screen.getByText("commerce:MEMBER_USAGE_COLUMN_USED")).toBeVisible();
    expect(screen.getByText("team:TEAM_USAGE_SUMMARY:25:725")).toBeVisible();
  });

  it("keeps explicit unlimited availability distinct from a missing Usage row", () => {
    const { rerender } = render(
      <TeamMemberCreditUsageCell usage={{ ...usage, availableCredits: null }} loading={false} />,
    );

    expect(
      screen.getByText("team:TEAM_USAGE_SUMMARY:25:commerce:MEMBER_LIMIT_UNLIMITED"),
    ).toBeVisible();

    rerender(<TeamMemberCreditUsageCell loading={false} />);
    expect(screen.getByText("team:TEAM_USAGE_NOT_AVAILABLE")).toBeVisible();
  });

  it("renders a visible loading state without inventing zero Usage", () => {
    render(<TeamMemberCreditUsageCell loading />);

    expect(screen.getByRole("status", { name: "team:TEAM_USAGE_LOADING" })).toBeVisible();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
