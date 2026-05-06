import { api } from "@/lib/http";
import { toQueryString, orgInvitationPath, orgInviteLinkPath, orgMemberPath } from "@/lib/api";

import type {
  OrgRole,
  OrganizationInvitation,
  OrganizationInvitationListParams,
  OrganizationInviteLink,
  OrganizationInviteLinkParticipant,
  OrganizationInviteResult,
  OrganizationMember,
  OrganizationMemberListParams,
  PageData,
} from "@arclayer/openapi/admin-types";

export async function listOrganizationMembers(
  params: OrganizationMemberListParams,
): Promise<PageData<OrganizationMember>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    ordering: params.ordering,
    role: params.role,
    roleCode: params.roleCode,
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
    ordering: params.ordering,
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
  return api.post<{ invitation: OrganizationInvitation; token: string; inviteUrl: string | null }>(
    orgInvitationPath(invitationId, "/renew"),
    payload,
  );
}

export async function revokeOrganizationInvitation(
  invitationId: string,
): Promise<{ invitationId: string; revoked: boolean }> {
  return api.post<{ invitationId: string; revoked: boolean }>(
    orgInvitationPath(invitationId, "/revoke"),
  );
}

export async function listOrganizationInviteLinks(params: {
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
  mine?: boolean;
}): Promise<PageData<OrganizationInviteLink>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    ordering: params.ordering,
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
  return api.post<{ link: OrganizationInviteLink; token: string; inviteUrl: string | null }>(
    orgInviteLinkPath(linkId, "/renew"),
    payload,
  );
}

export async function disableOrganizationInviteLink(
  linkId: string,
): Promise<{ invitationId: string; revoked: boolean }> {
  return api.post<{ invitationId: string; revoked: boolean }>(
    orgInviteLinkPath(linkId, "/disable"),
  );
}

export async function listOrganizationInviteLinkParticipants(
  linkId: string,
  params: { page?: number; size?: number; q?: string } = {},
): Promise<PageData<OrganizationInviteLinkParticipant>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
  });
  return api.get<PageData<OrganizationInviteLinkParticipant>>(
    `${orgInviteLinkPath(linkId, "/participants")}${query}`,
  );
}

export async function patchOrganizationMemberRole(
  membershipId: string,
  payload: { roleCode?: string; role?: OrgRole },
): Promise<OrganizationMember> {
  return api.patch<OrganizationMember>(orgMemberPath(membershipId, "/role"), payload);
}

export async function deleteOrganizationMember(
  membershipId: string,
): Promise<{ membershipId: string; removed: boolean }> {
  return api.delete<{ membershipId: string; removed: boolean }>(orgMemberPath(membershipId));
}
