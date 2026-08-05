import { describe, expect, it } from "vitest";

import { resolveMemberCreditLimitActionState } from "@/pages/workspaces/team/members/components/team-members-view";

describe("resolveMemberCreditLimitActionState", () => {
  it("exposes management only for active members present in the manager snapshot", () => {
    expect(
      resolveMemberCreditLimitActionState({
        membershipStatus: "active",
        managementStatus: "manage",
        queryStatus: "success",
        hasItem: true,
      }),
    ).toBe("manage");
  });

  it("hides the action from ordinary members and non-active targets", () => {
    expect(
      resolveMemberCreditLimitActionState({
        membershipStatus: "active",
        managementStatus: "view",
        queryStatus: "success",
        hasItem: true,
      }),
    ).toBe("hidden");
    expect(
      resolveMemberCreditLimitActionState({
        membershipStatus: "disabled",
        managementStatus: "manage",
        queryStatus: "success",
        hasItem: true,
      }),
    ).toBe("hidden");
  });

  it("keeps manager loading and error states explicit", () => {
    expect(
      resolveMemberCreditLimitActionState({
        membershipStatus: "active",
        managementStatus: "loading",
        queryStatus: "loading",
        hasItem: false,
      }),
    ).toBe("loading");
    expect(
      resolveMemberCreditLimitActionState({
        membershipStatus: "active",
        managementStatus: "manage",
        queryStatus: "error",
        hasItem: false,
      }),
    ).toBe("error");
  });
});
