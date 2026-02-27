import type { MembershipStatus, UserStatus } from "@/types/api";

export type { MembershipStatus, UserStatus };

export type TeamMembersFilters = {
  membershipStatus?: MembershipStatus;
  userStatus?: UserStatus;
  roleCode?: string;
};

export type TeamMemberSort =
  | "user__username"
  | "-user__username"
  | "user__email"
  | "-user__email"
  | "user__last_login_at"
  | "-user__last_login_at"
  | "status"
  | "-status"
  | "-created_at";
