import type { TeamMember, UserStatus } from "@/types/api";

export interface TeamMemberExtraQuery {
  status?: TeamMember["membershipStatus"];
  userStatus?: UserStatus;
  roleCode?: string;
}
