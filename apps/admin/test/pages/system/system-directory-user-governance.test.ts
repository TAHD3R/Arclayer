import { describe, expect, it } from "vitest";

import {
  getUserActionAvailability,
  type UserActionTarget,
} from "@/pages/system/directory/users/governance-dialogs";

function buildUser(overrides: Partial<UserActionTarget> = {}): UserActionTarget {
  return {
    userId: "user-1",
    username: "member",
    displayName: "Member",
    email: "member@example.com",
    status: "active",
    avatarUrl: null,
    avatar_url: null,
    hasPassword: true,
    twoFactorEnabled: true,
    isSuperAdmin: false,
    linkedOauthProviders: ["google"],
    ...overrides,
  };
}

describe("getUserActionAvailability", () => {
  it("hides destructive account and permission actions for the current user", () => {
    const availability = getUserActionAvailability(buildUser({ isSuperAdmin: true }), "user-1");

    expect(availability.isCurrentUser).toBe(true);
    expect(availability.canDisableAccount).toBe(false);
    expect(availability.canDeleteAccount).toBe(false);
    expect(availability.canRevokeSuperAdmin).toBe(false);
  });

  it("exposes role actions according to the target permission", () => {
    const standardUser = getUserActionAvailability(buildUser(), "admin-1");
    const superAdmin = getUserActionAvailability(
      buildUser({ userId: "user-2", isSuperAdmin: true }),
      "admin-1",
    );

    expect(standardUser.canGrantSuperAdmin).toBe(true);
    expect(standardUser.canRevokeSuperAdmin).toBe(false);
    expect(superAdmin.canGrantSuperAdmin).toBe(false);
    expect(superAdmin.canRevokeSuperAdmin).toBe(true);
  });
});
