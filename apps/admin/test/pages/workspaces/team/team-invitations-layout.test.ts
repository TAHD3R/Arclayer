import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const TEAM_INVITATIONS_VIEW_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/team/invitations/components/team-invitations-view.tsx",
);

describe("team invitations layout", () => {
  it("renders the invitations page as lightweight tabbed settings tables with page-header actions and infinite loading", () => {
    const source = readFileSync(TEAM_INVITATIONS_VIEW_PATH, "utf8");

    expect(source).toContain("const currentToolbar =");
    expect(source).toContain("const inviteAction = (");
    expect(source).toContain("extra={currentToolbar}");
    expect(source).toContain("action={inviteAction}");
    expect(source).not.toContain("toolbar={");
    expect(source).toContain("<DataTableSearchInput");
    expect(source).toContain("<DataTableInfiniteScrollFooter");
    expect(source).toContain('emptyTitle={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}');
    expect(source).toContain('emptyTitle={t("team:TEAM_INVITE_LINKS_EMPTY_TITLE")}');
    expect(source).toContain("<SettingsTableRefreshSkeleton />");
    expect(source).not.toContain('t("common:LOADING")');
    expect(source).not.toContain("AdminDataTableSection");
    expect(source).not.toContain("useDataTable(");
    expect(source).not.toContain("TeamInvitationsPageExtra");
    expect(source).toContain('value="pending" className="min-h-0 flex flex-col"');
    expect(source).toContain('value="accepted" className="min-h-0 flex flex-col"');
    expect(source).toContain('value="links" className="min-h-0 flex flex-col"');
  });
});
