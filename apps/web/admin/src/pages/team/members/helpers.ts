import type { TeamMember, UserStatus } from "@/api/team";

export interface TeamMemberFilters {
  membershipStatus?: "active" | "invited" | "disabled";
  userStatus?: UserStatus;
  roleCode?: string;
}

export interface TeamMemberExtraQuery {
  status?: TeamMember["membershipStatus"];
  userStatus?: UserStatus;
  roleCode?: string;
}

export function userInitials(member: TeamMember): string {
  const label = (member.displayName || member.username || member.email || "U").trim();
  return label.slice(0, 1).toUpperCase();
}

export function userStatusTagColor(status: UserStatus): string {
  if (status === "active") return "green";
  if (status === "disabled") return "red";
  return "gold";
}

export function membershipStatusTagColor(status: TeamMember["membershipStatus"]): string {
  if (status === "active") return "green";
  if (status === "invited") return "blue";
  return "red";
}

export function teamMembersTableId(workspaceId: string | null | undefined): string {
  return workspaceId ? `team-members:${workspaceId}` : "team-members";
}

export function teamMembersQueryKey(workspaceId: string | null | undefined): [string, string] {
  return ["dataTable", teamMembersTableId(workspaceId)];
}

export function resolveWorkspaceName(
  items: Array<{ workspaceId: string; name: string }> | undefined,
  workspaceId: string | null,
  fallback: string,
): string {
  const found = workspaceId ? items?.find((item) => String(item.workspaceId) === workspaceId) : undefined;
  return found?.name || fallback;
}

export function buildTeamMemberExtraQuery(filters: TeamMemberFilters): TeamMemberExtraQuery {
  return {
    status: filters.membershipStatus,
    userStatus: filters.userStatus,
    roleCode: filters.roleCode,
  };
}
