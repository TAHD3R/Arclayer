import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SystemDirectoryUserIdentityCard } from "@/pages/system/directory/users/user-identity-card";
import type { SystemDirectoryUser } from "@arclayer/openapi/admin-types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

const USER: SystemDirectoryUser = {
  userId: "user-1",
  username: "philip",
  displayName: "Philip Cole",
  email: "admin@example.com",
  status: "disabled",
  avatarUrl: null,
  isSuperAdmin: true,
  hasPassword: true,
  twoFactorEnabled: true,
  linkedOauthProviders: ["github"],
  createdAt: "2026-07-01T08:00:00Z",
  lastLoginAt: "2026-07-23T01:00:00Z",
  workspaceMembershipCount: 3,
  projectMembershipCount: 8,
  restrictions: [
    {
      actorUserId: "operator-1",
      allowedRecoveryActions: [],
      auditEventId: "event-1",
      effectiveAt: "2026-07-23T02:00:00Z",
      entityId: "user-1",
      entityType: "user",
      expiresAt: null,
      liftNote: null,
      liftedAt: null,
      liftedByUserId: null,
      operatorNote: "internal-only",
      reasonCategory: "security_risk",
      reasonCode: "security-risk",
      restrictionId: "restriction-1",
      restrictionType: "user_disabled",
      reviewAt: null,
      revision: 1,
      state: "active",
      supportAvailable: true,
    },
  ],
};

describe("SystemDirectoryUserIdentityCard", () => {
  it("shows operational identity facts and safe navigation actions on hover", async () => {
    const onEdit = vi.fn();
    const onOpenDetail = vi.fn();
    const user = userEvent.setup();
    render(
      <SystemDirectoryUserIdentityCard
        user={USER}
        formatDateTime={(value) => `date:${value}`}
        onOpenDetail={onOpenDetail}
        onEdit={onEdit}
      />,
    );

    await user.hover(screen.getByRole("button", { name: "Philip Cole" }));

    expect(await screen.findByText("@philip")).toBeVisible();
    expect(screen.getByText("github", { exact: false })).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByText("8")).toBeVisible();
    expect(
      screen.getByText("settings:SETTINGS_ACCESS_RESTRICTION_REASON_SECURITY_RISK", {
        exact: false,
      }),
    ).toBeVisible();
    expect(screen.queryByText("internal-only")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "platform:AUDIT_TITLE" })).toHaveAttribute(
      "href",
      "/system/audit-log?view=events&actorUserId=user-1",
    );
    expect(screen.getByRole("link", { name: "platform:FEEDBACK_CENTER_TITLE" })).toHaveAttribute(
      "href",
      "/system/feedback?reporterUserId=user-1",
    );
    expect(
      screen.getByRole("link", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_VIEW_OWNED_WORKSPACES",
      }),
    ).toHaveAttribute("href", "/system/tenants/workspaces?ownerUserId=user-1");
    expect(
      screen.getByRole("link", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_VIEW_OWNED_PROJECTS",
      }),
    ).toHaveAttribute("href", "/system/tenants/projects?ownerUserId=user-1");

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DETAILS",
      }),
    );
    expect(onOpenDetail).toHaveBeenCalledWith(USER);

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ACCOUNT",
      }),
    );
    expect(onEdit).toHaveBeenCalledWith(USER);
  });
});
