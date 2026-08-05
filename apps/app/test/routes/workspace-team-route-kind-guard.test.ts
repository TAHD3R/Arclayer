import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeamMembersPage } from "@/pages/workspaces/team/members/page";

describe("workspace members settings hard cut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the team members surface available as a direct page component", () => {
    expect(TeamMembersPage).toBeTypeOf("function");
  });
});
