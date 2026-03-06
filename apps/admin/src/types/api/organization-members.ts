export type OrgRole = "owner" | "admin" | "member";
export type OrgMembershipStatus = "active" | "invited" | "disabled";
export type OrgUserStatus = "active" | "disabled" | "locked";
export type OrgInvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type OrgInvitationType = "email" | "link";

export type OrganizationMemberWorkspace = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  iconUrl: string | null;
  membershipStatus: OrgMembershipStatus;
  roleCodes: string[];
  joinedAt: string;
};

export type OrganizationMember = {
  id: string;
  membershipId: string;
  organizationId: string;
  role: OrgRole;
  roleCode: string;
  status: OrgMembershipStatus;
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  userStatus: OrgUserStatus;
  lastLoginAt: string | null;
  joinedAt: string;
  workspaceCount: number;
  workspaces: OrganizationMemberWorkspace[];
};

export type OrganizationMemberListParams = {
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
  role?: OrgRole;
  roleCode?: string;
  membershipStatus?: OrgMembershipStatus;
  userStatus?: OrgUserStatus;
  hasWorkspace?: boolean;
  joinedFrom?: string;
  joinedTo?: string;
  lastLoginFrom?: string;
  lastLoginTo?: string;
};

export type OrganizationInvitationUserRef = {
  userId: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type OrganizationInvitation = {
  id: string;
  invitationType: OrgInvitationType;
  email: string | null;
  displayCode: string | null;
  roleCode: string;
  expiresAt: string | null;
  createdByUserId: string | null;
  createdBy: OrganizationInvitationUserRef | null;
  acceptedByUserId: string | null;
  acceptedBy: OrganizationInvitationUserRef | null;
  revokedByUserId: string | null;
  revokedBy: OrganizationInvitationUserRef | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: OrgInvitationStatus;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationInvitationListParams = {
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
  status?: OrgInvitationStatus | "processed";
  mine?: boolean;
};

export type OrganizationInviteResult = {
  invitationId: string;
  email: string;
  roleCode: string;
  token: string;
  inviteUrl: string | null;
};

export type OrganizationInviteLink = {
  id: string;
  displayCode: string;
  roleCode: string;
  expiresAt: string | null;
  disabledAt: string | null;
  maxUses: number | null;
  allowedEmailDomain: string | null;
  token: string;
  inviteUrl: string | null;
  createdByUserId: string | null;
  createdBy: OrganizationInvitationUserRef | null;
  lastUsedByUserId: string | null;
  lastUsedBy: OrganizationInvitationUserRef | null;
  lastUsedAt: string | null;
  usesCount: number;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationInviteLinkParticipant = {
  user: OrganizationInvitationUserRef;
  usedAt: string;
};
