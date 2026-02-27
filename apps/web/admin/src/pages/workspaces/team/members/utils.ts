import type { SortingState } from "@tanstack/react-table";

import type { TeamMember, UserStatus } from "@/types/api";
import type { TeamMembersFilters, TeamMemberSort } from "@/pages/workspaces/team/shared/types";
import type { TeamMemberExtraQuery } from "@/pages/workspaces/team/members/types";

export function sortValueToTableSorting(value: TeamMemberSort): SortingState {
  if (value === "user__username") return [{ id: "user", desc: false }];
  if (value === "-user__username") return [{ id: "user", desc: true }];
  if (value === "user__last_login_at") return [{ id: "lastLoginAt", desc: false }];
  if (value === "-user__last_login_at") return [{ id: "lastLoginAt", desc: true }];
  if (value === "status") return [{ id: "userStatus", desc: false }];
  if (value === "-status") return [{ id: "userStatus", desc: true }];
  return [];
}

export function tableSortingToSortValue(sorting: SortingState): TeamMemberSort | null {
  const [first] = sorting;
  if (!first) return null;

  if (first.id === "user") return first.desc ? "-user__username" : "user__username";
  if (first.id === "lastLoginAt") {
    return first.desc ? "-user__last_login_at" : "user__last_login_at";
  }
  if (first.id === "userStatus") return first.desc ? "-status" : "status";

  return null;
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
  const found = workspaceId
    ? items?.find((item) => String(item.workspaceId) === workspaceId)
    : undefined;
  return found?.name || fallback;
}

export function buildTeamMemberExtraQuery(filters: TeamMembersFilters): TeamMemberExtraQuery {
  return {
    status: filters.membershipStatus,
    userStatus: filters.userStatus,
    roleCode: filters.roleCode,
  };
}
