import type { WorkspaceTeamMemberOut as TeamMember, UserStatus } from "@arclayer/openapi";

export interface TeamMemberExtraQuery {
  status?: TeamMember["membershipStatus"];
  userStatus?: UserStatus;
  roleCode?: string;
}
