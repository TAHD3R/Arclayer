import type { TeamMember, UserStatus } from "@arclayer/openapi/admin-types";

export interface TeamMemberExtraQuery {
  status?: TeamMember["membershipStatus"];
  userStatus?: UserStatus;
  roleCode?: string;
}
