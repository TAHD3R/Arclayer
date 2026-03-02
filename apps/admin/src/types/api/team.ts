export type MembershipStatus = "active" | "invited" | "disabled";
export type UserStatus = "active" | "disabled" | "locked";

export type TeamMember = {
  id: string;
  membershipId: string;
  membershipStatus: MembershipStatus;
  userId: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  userStatus: UserStatus;
  lastLoginAt: string | null;
  roleCodes: string[];
};

export type TeamUserOption = {
  value: string;
  label: string;
  avatarUrl?: string | null;
};

export type ListTeamMembersParams = {
  page?: number;
  size?: number;
  q?: string;
  status?: MembershipStatus;
  roleCode?: string;
  userStatus?: UserStatus;
  ordering?: string;
};

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type TeamUserRef = {
  userId: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type TeamInvitation = {
  id: string;
  email: string;
  roleCode: string | null;
  expiresAt: string | null;
  createdByUserId: string;
  createdBy: TeamUserRef | null;
  acceptedByUserId: string | null;
  acceptedBy: TeamUserRef | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: InvitationStatus;
  createdAt: string;
  updatedAt: string;
};

export type TeamInvitationCreateResult = {
  invitation: TeamInvitation;
  token: string;
  inviteUrl: string | null;
};

export type ListTeamInvitationsParams = {
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
  status?: InvitationStatus;
  mine?: boolean;
};

export type TeamInviteLink = {
  id: string;
  displayCode: string;
  roleCode: string | null;
  expiresAt: string | null;
  disabledAt: string | null;
  maxUses: number | null;
  allowedEmailDomain: string | null;
  token: string;
  inviteUrl: string | null;
  createdBy: TeamUserRef | null;
  lastUsedBy: TeamUserRef | null;
  lastUsedAt: string | null;
  usesCount: number;
  recentParticipants: {
    user: TeamUserRef;
    usedAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
};

export type TeamInviteLinkCreateResult = {
  link: TeamInviteLink;
  token: string;
  inviteUrl: string | null;
};

export type ListTeamInviteLinksParams = {
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
  mine?: boolean;
};

export type TeamInviteLinkParticipant = {
  user: TeamUserRef;
  usedAt: string;
};

export type ListTeamInviteLinkParticipantsParams = {
  page?: number;
  size?: number;
  q?: string;
};
