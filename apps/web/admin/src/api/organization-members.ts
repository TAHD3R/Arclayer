import { api } from "@/lib/http";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type OrgRole = "owner" | "admin" | "member";
export type OrgMembershipStatus = "active" | "invited" | "disabled";
export type OrgUserStatus = "active" | "disabled" | "locked";
export type OrgInvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type OrgInvitationType = "email" | "link";

export type OrganizationMemberWorkspace = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
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
  role?: OrgRole;
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

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function listOrganizationMembers(
  params: OrganizationMemberListParams,
): Promise<PageData<OrganizationMember>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    role: params.role,
    membershipStatus: params.membershipStatus,
    userStatus: params.userStatus,
    hasWorkspace: params.hasWorkspace,
    joinedFrom: params.joinedFrom,
    joinedTo: params.joinedTo,
    lastLoginFrom: params.lastLoginFrom,
    lastLoginTo: params.lastLoginTo,
  });
  return api.get<PageData<OrganizationMember>>(`/organizations/me/members${query}`);
}

export async function listOrganizationInvitations(
  params: OrganizationInvitationListParams,
): Promise<PageData<OrganizationInvitation>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    status: params.status,
    mine: params.mine,
  });
  return api.get<PageData<OrganizationInvitation>>(`/organizations/me/invitations${query}`);
}

export async function inviteOrganizationMember(payload: {
  email: string;
  roleCode: string;
  expiresInSeconds?: number;
}): Promise<OrganizationInviteResult> {
  return api.post<OrganizationInviteResult>("/organizations/me/invitations", payload);
}

export async function renewOrganizationInvitation(
  invitationId: string,
  payload: { expiresInSeconds?: number | null },
): Promise<{ invitation: OrganizationInvitation; token: string; inviteUrl: string | null }> {
  const id = encodeURIComponent(String(invitationId));
  return api.post<{ invitation: OrganizationInvitation; token: string; inviteUrl: string | null }>(
    `/organizations/me/invitations/${id}/renew`,
    payload,
  );
}

export async function revokeOrganizationInvitation(
  invitationId: string,
): Promise<{ invitationId: string; revoked: boolean }> {
  const id = encodeURIComponent(String(invitationId));
  return api.post<{ invitationId: string; revoked: boolean }>(
    `/organizations/me/invitations/${id}/revoke`,
  );
}

export async function listOrganizationInviteLinks(params: {
  page?: number;
  size?: number;
  q?: string;
  mine?: boolean;
}): Promise<PageData<OrganizationInviteLink>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    mine: params.mine,
  });
  return api.get<PageData<OrganizationInviteLink>>(`/organizations/me/invitations/links${query}`);
}

export async function createOrganizationInviteLink(payload: {
  roleCode?: string | null;
  expiresInSeconds?: number | null;
  maxUses?: number | null;
  allowedEmailDomain?: string | null;
}): Promise<{ link: OrganizationInviteLink; token: string; inviteUrl: string | null }> {
  return api.post<{ link: OrganizationInviteLink; token: string; inviteUrl: string | null }>(
    "/organizations/me/invitations/links",
    payload,
  );
}

export async function renewOrganizationInviteLink(
  linkId: string,
  payload: { expiresInSeconds?: number | null },
): Promise<{ link: OrganizationInviteLink; token: string; inviteUrl: string | null }> {
  const id = encodeURIComponent(String(linkId));
  return api.post<{ link: OrganizationInviteLink; token: string; inviteUrl: string | null }>(
    `/organizations/me/invitations/links/${id}/renew`,
    payload,
  );
}

export async function disableOrganizationInviteLink(
  linkId: string,
): Promise<{ invitationId: string; revoked: boolean }> {
  const id = encodeURIComponent(String(linkId));
  return api.post<{ invitationId: string; revoked: boolean }>(
    `/organizations/me/invitations/links/${id}/disable`,
  );
}

export async function listOrganizationInviteLinkParticipants(
  linkId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<OrganizationInviteLinkParticipant>> {
  const id = encodeURIComponent(String(linkId));
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 20 });
  return api.get<PageData<OrganizationInviteLinkParticipant>>(
    `/organizations/me/invitations/links/${id}/participants${query}`,
  );
}

export async function patchOrganizationMemberRole(
  membershipId: string,
  payload: { roleCode?: string; role?: OrgRole },
): Promise<OrganizationMember> {
  const id = encodeURIComponent(String(membershipId));
  return api.patch<OrganizationMember>(`/organizations/me/members/${id}/role`, payload);
}

export async function deleteOrganizationMember(
  membershipId: string,
): Promise<{ membershipId: string; removed: boolean }> {
  const id = encodeURIComponent(String(membershipId));
  return api.delete<{ membershipId: string; removed: boolean }>(`/organizations/me/members/${id}`);
}
