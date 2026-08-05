import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const TEAM_MEMBERS_VIEW_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/team/members/components/team-members-view.tsx",
);
const INVITE_MEMBERS_DIALOG_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/team/shared/components/invite-members-dialog.tsx",
);

describe("team members layout", () => {
  it("renders the members page as a settings table with search, sort, and infinite loading", () => {
    const source = readFileSync(TEAM_MEMBERS_VIEW_PATH, "utf8");

    expect(source).toContain("const pageToolbar = (");
    expect(source).toContain("extra={pageToolbar}");
    expect(source).not.toContain("toolbar={");
    expect(source).toContain("<DataTableSearchInput");
    expect(source).toContain("<Select value={sort}");
    expect(source).toContain(
      '<table className="min-w-[76rem] w-full table-fixed border-collapse">',
    );
    expect(source).toContain("<DataTableInfiniteScrollFooter");
    expect(source).toContain(
      "empty={!membersQuery.isLoading && !membersQuery.isError && rows.length === 0}",
    );
    expect(source).toContain("<SettingsTableRefreshSkeleton />");
    expect(source).not.toContain('t("common:LOADING")');
    expect(source).toContain('variant="compact"');
    expect(source).toContain(
      'className="w-1/5 py-2 pr-4 text-left text-callout font-semibold text-label-secondary"',
    );
    expect(source).toContain(
      'className="w-1/5 px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary"',
    );
    expect(source).toContain('<div className="flex items-start justify-between gap-3">');
    expect(source).not.toContain("WorkspaceMemberContextDialog");
    expect(source).not.toContain("onOpenDetails=");
    expect(source).not.toContain("AdminDataTableSection");
    expect(source).not.toContain("useDataTable(");
    expect(source).toContain("useTeamMemberCreditUsage(workspaceId)");
    expect(source).toContain("useMemberCreditLimitOverrides(workspaceId)");
    expect(source).toContain("<TeamMemberCreditUsageCell");
    expect(source).toContain('t("team:TEAM_TABLE_COL_USAGE")');
  });

  it("presents the canonical owner separately and removes ordinary member actions", () => {
    const source = readFileSync(TEAM_MEMBERS_VIEW_PATH, "utf8");

    expect(source).toContain("const roleSummary = member.isOwner");
    expect(source).toContain('t("team:TEAM_MEMBER_OWNER")');
    expect(source).toContain("const canEditMemberRoles =");
    expect(source).toContain("!member.isOwner");
    expect(source).toContain("const canDisable =");
    expect(source).toContain("const canEnable =");
    expect(source).toContain('creditLimitAction === "hidden"');
    expect(source).toContain("<MemberCreditLimitDialog");
    expect(source).toContain('t("commerce:MEMBER_LIMIT_OVERRIDE_ACTION")');
  });

  it("does not fetch or expose role controls unless the server enables role management", () => {
    const source = readFileSync(TEAM_MEMBERS_VIEW_PATH, "utf8");
    const inviteDialog = readFileSync(INVITE_MEMBERS_DIALOG_PATH, "utf8");

    expect(source).toContain("useWorkspaceRolesAccess");
    expect(source).toContain('rolesAccess.status === "available"');
    expect(source).toContain("enabled: Boolean(workspaceId) && roleManagementAvailable");
    expect(source).toContain('rolesAccess.status === "unavailable"');
    expect(source).toContain('t("team:TEAM_MEMBER_FIXED_ACCESS")');
    expect(source).toContain("roleManagementAvailable ? (");
    expect(source).toContain("<EditMemberRolesDialog");
    expect(inviteDialog).toContain('{ access: "fixed-member" } as const');
    expect(inviteDialog).toContain("props.roleManagementAvailable ? (");
  });

  it("keeps feature access separate from roles and mounts the typed controller dialog", () => {
    const source = readFileSync(TEAM_MEMBERS_VIEW_PATH, "utf8");

    expect(source).toContain("useMemberFeatureAccess");
    expect(source).toContain("featureAccess.actionStateFor(member)");
    expect(source).toContain("featureAccess.openForMember(member)");
    expect(source).toContain("<MemberFeatureAccessDialog {...featureAccess.dialogProps} />");
    expect(source).not.toContain("agents.use");
  });
});
