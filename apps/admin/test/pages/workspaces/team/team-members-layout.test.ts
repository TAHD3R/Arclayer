import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const TEAM_MEMBERS_VIEW_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/team/members/components/team-members-view.tsx",
);

describe("team members layout", () => {
  it("renders the members page as a settings table with search, sort, and pagination controls", () => {
    const source = readFileSync(TEAM_MEMBERS_VIEW_PATH, "utf8");

    expect(source).toContain("const pageToolbar = (");
    expect(source).toContain("extra={pageToolbar}");
    expect(source).not.toContain("toolbar={");
    expect(source).toContain("<DataTableSearchInput");
    expect(source).toContain("<Select value={sort}");
    expect(source).toContain(
      '<table className="min-w-[62rem] w-full table-fixed border-collapse">',
    );
    expect(source).toContain("<DataPaginationControls");
    expect(source).toContain(
      "empty={!membersQuery.isLoading && !membersQuery.isError && rows.length === 0}",
    );
    expect(source).toContain("<SettingsTableRefreshSkeleton />");
    expect(source).not.toContain('t("common:LOADING")');
    expect(source).toContain('variant="compact"');
    expect(source).toContain(
      'className="w-1/4 py-2 pr-4 text-left text-callout font-semibold text-label-secondary"',
    );
    expect(source).toContain(
      'className="w-1/4 px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary"',
    );
    expect(source).toContain('<div className="flex items-start justify-between gap-3">');
    expect(source).not.toContain("WorkspaceMemberContextDialog");
    expect(source).not.toContain("onOpenDetails=");
    expect(source).not.toContain("AdminDataTableSection");
    expect(source).not.toContain("useDataTable(");
  });
});
