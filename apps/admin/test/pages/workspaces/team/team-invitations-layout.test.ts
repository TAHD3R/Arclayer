import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const TEAM_INVITATIONS_VIEW_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/team/invitations/components/team-invitations-view.tsx",
);
const INVITATION_COLUMNS_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/team/invitations/components/invitation-table-columns.tsx",
);
const INVITATION_CONTROLS_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/team/invitations/components/invitation-table-controls.tsx",
);

describe("team invitations layout", () => {
  it("uses shared DataTables for all three invitation tabs", () => {
    const source = readFileSync(TEAM_INVITATIONS_VIEW_PATH, "utf8");

    expect(source).toContain("useDataTable<TeamInvitation, InvitationTableFilters>");
    expect(source).toContain("useDataTable<TeamInviteLink, InvitationTableFilters>");
    expect(source.match(/<AdminDataTableSection/g)).toHaveLength(3);
    expect(source).toContain("infiniteScroll={pendingTable.infiniteScroll}");
    expect(source).toContain("infiniteScroll={acceptedTable.infiniteScroll}");
    expect(source).toContain("infiniteScroll={linksTable.infiniteScroll}");
    expect(source).toContain("<InvitationTableControls");
    expect(source).toContain("<DataTableSearchInput");
    expect(source).toContain("action={inviteAction}");
    expect(source).toContain("rowSelection: { enabled: true");
    expect(source).toContain("<FloatingBulkToolbar");
    expect(source).toContain("ephemeralInviteUrlByLinkId");
    expect(source).not.toContain("link.token");
    expect(source).not.toContain("link.inviteUrl");
    expect(source).not.toContain(".filter((item) => !item.disabledAt)");
  });

  it("provides shared filter/order controls and primary plus overflow row actions", () => {
    const columns = readFileSync(INVITATION_COLUMNS_PATH, "utf8");
    const controls = readFileSync(INVITATION_CONTROLS_PATH, "utf8");

    expect(controls).toContain("<Filters");
    expect(controls).toContain("<Select");
    expect(controls).toContain('shortcutKey="f"');
    expect(controls).toContain('value: "active"');
    expect(controls).toContain('value: "disabled"');
    expect(columns).toContain("selectionColumn(options.t)");
    expect(columns).toContain("<DropdownMenu>");
    expect(columns).toContain('variant="ghost"');
    expect(columns).toContain("TEAM_INVITE_LINKS_ACTION_ROTATE_TO_COPY");
  });
});
