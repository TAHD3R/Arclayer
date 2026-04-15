import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const TEAM_MEMBERS_VIEW_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/team/members/components/team-members-view.tsx",
);

describe("team members layout", () => {
  it("mounts the page toolbar through DefaultPage extra instead of AdminDataTableSection.toolbar", () => {
    const source = readFileSync(TEAM_MEMBERS_VIEW_PATH, "utf8");

    expect(source).toContain("const pageToolbar = (");
    expect(source).toContain("extra={pageToolbar}");
    expect(source).not.toContain("toolbar={");
  });
});
