import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentPlatformTeamIdentity,
  getPlatformTeam,
  listPlatformRoles,
} from "@/access/access-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { PlatformTeamPage } from "@/pages/access-team";

vi.mock("@/access/access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/access/access-api")>();
  return {
    ...actual,
    getCurrentPlatformTeamIdentity: vi.fn(),
    getPlatformTeam: vi.fn(),
    listPlatformRoles: vi.fn(),
  };
});

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(getCurrentPlatformTeamIdentity).mockResolvedValue({
    delegablePermissions: [],
    effectivePermissions: ["platform:access-team:read"],
    isInstanceOwner: false,
    operatorId: "operator-current",
    operatorRevision: 1,
    operatorStatus: "active",
    userId: "user-current",
  });
  vi.mocked(getPlatformTeam).mockResolvedValue({
    invitations: [],
    operators: [
      {
        activatedAt: "2026-08-01T00:00:00.000Z",
        deactivatedAt: null,
        mfa: { phishingResistantReady: true, verifiedMethodCount: 1 },
        operatorId: "operator-current",
        revision: 1,
        roles: [],
        sessions: { activeSessionCount: 1, mostRecentActivityAt: "2026-08-01T00:00:00.000Z" },
        status: "active",
        user: { displayName: "Read-only operator", userId: "user-current", username: "readonly" },
      },
    ],
    owner: null,
  });
});

describe("Platform team page", () => {
  it("renders for team-read without loading the role catalog", async () => {
    render(<PlatformTeamPage />);

    expect(await screen.findByText("Read-only operator")).toBeVisible();
    expect(getPlatformTeam).toHaveBeenCalledOnce();
    expect(getCurrentPlatformTeamIdentity).toHaveBeenCalledOnce();
    expect(listPlatformRoles).not.toHaveBeenCalled();
  });

  it("exposes the available safe team-management actions when the current operator is authorized", async () => {
    const user = userEvent.setup();
    vi.mocked(getCurrentPlatformTeamIdentity).mockResolvedValue({
      delegablePermissions: [],
      effectivePermissions: [
        "platform:access-team:read",
        "platform:access-team:invite",
        "platform:access-team:remove",
        "platform:access-roles:manage",
        "platform:access-sessions:read",
        "platform:access-sessions:revoke",
        "platform:access-mfa:reset",
      ],
      isInstanceOwner: true,
      operatorId: null,
      operatorRevision: null,
      operatorStatus: null,
      userId: "user-owner",
    });
    vi.mocked(getPlatformTeam).mockResolvedValue({
      invitations: [],
      operators: [
        {
          activatedAt: "2026-08-01T00:00:00.000Z",
          deactivatedAt: null,
          mfa: { phishingResistantReady: true, verifiedMethodCount: 1 },
          operatorId: "operator-current",
          revision: 1,
          roles: [],
          sessions: { activeSessionCount: 1, mostRecentActivityAt: "2026-08-01T00:00:00.000Z" },
          status: "active",
          user: { displayName: "Operator", userId: "user-current", username: "operator" },
        },
      ],
      owner: {
        mfa: { phishingResistantReady: true, verifiedMethodCount: 1 },
        ownershipRevision: 3,
        sessions: { activeSessionCount: 1, mostRecentActivityAt: "2026-08-01T00:00:00.000Z" },
        user: { displayName: "Owner", userId: "user-owner", username: "owner" },
      },
    });

    render(<PlatformTeamPage />);

    expect(await screen.findByText("Owner")).toBeVisible();
    expect(screen.getByRole("button", { name: "Invite team member" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Manage Operator" }));
    expect(screen.getByRole("menuitem", { name: "Manage roles" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "View login devices" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Start verification recovery" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Remove Platform access" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Transfer instance ownership" }),
    ).not.toBeInTheDocument();
    expect(listPlatformRoles).toHaveBeenCalledOnce();
  });
});
