import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const TEAM_INVITATIONS_VIEW_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/team/invitations/components/team-invitations-view.tsx",
);

describe("team invitations layout", () => {
  it("mounts the active tab toolbar through DefaultPage extra instead of the table section", () => {
    const source = readFileSync(TEAM_INVITATIONS_VIEW_PATH, "utf8");

    expect(source).toContain("const currentToolbar =");
    expect(source).toContain("extra={currentToolbar}");
    expect(source).not.toContain("toolbar={");
    expect(source).toContain('value="pending" className="min-h-0 flex flex-col"');
    expect(source).toContain('value="accepted" className="min-h-0 flex flex-col"');
    expect(source).toContain('value="links" className="min-h-0 flex flex-col"');
  });
});
