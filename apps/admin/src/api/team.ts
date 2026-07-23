import { api } from "@/lib/http";
import { workspacePath, toQueryString } from "@/lib/api";

import type {
  PageData,
  MembershipStatus,
  TeamMember,
  TeamUserOption,
  ListTeamMembersParams,
  TeamInvitation,
  TeamInvitationCreateResult,
  ListTeamInvitationsParams,
  TeamInviteLink,
  TeamInviteLinkCreateResult,
  ListTeamInviteLinksParams,
  TeamInviteLinkParticipant,
  ListTeamInviteLinkParticipantsParams,
} from "@arclayer/openapi/admin-types";

export async function listTeamMembers(
  workspaceId: string,
  params: ListTeamMembersParams = {},
): Promise<PageData<TeamMember>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    status: params.status,
    roleCode: params.roleCode,
    userStatus: params.userStatus,
    ordering: params.ordering,
  });
  return api.get<PageData<TeamMember>>(workspacePath(workspaceId, `/team/members${query}`));
}

export async function listTeamUserOptions(
  workspaceId: string,
  params: { page?: number; size?: number; q?: string } = {},
): Promise<PageData<TeamUserOption>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
  });
  return api.get<PageData<TeamUserOption>>(
    workspacePath(workspaceId, `/team/users/options${query}`),
  );
}

export async function setTeamMemberRoles(
  workspaceId: string,
  membershipId: string,
  payload: { roleCodes: string[] },
): Promise<null> {
  return api.put<null>(workspacePath(workspaceId, `/team/members/${membershipId}/roles`), payload);
}

export async function patchTeamMemberUser(
  workspaceId: string,
  membershipId: string,
  payload: { email?: string | null; displayName?: string | null; avatarUrl?: string | null },
): Promise<TeamMember> {
  return api.patch<TeamMember>(
    workspacePath(workspaceId, `/team/members/${membershipId}`),
    payload,
  );
}

export async function enableTeamMember(
  workspaceId: string,
  membershipId: string,
): Promise<{
  membershipId: string;
  status: MembershipStatus;
}> {
  return api.post(workspacePath(workspaceId, `/team/members/${membershipId}/enable`));
}

export async function disableTeamMember(
  workspaceId: string,
  membershipId: string,
): Promise<{
  membershipId: string;
  status: MembershipStatus;
}> {
  return api.post(workspacePath(workspaceId, `/team/members/${membershipId}/disable`));
}

export async function resetTeamMemberPassword(
  workspaceId: string,
  membershipId: string,
  payload: { newPassword: string },
): Promise<null> {
  return api.post<null>(
    workspacePath(workspaceId, `/team/members/${membershipId}/reset-password`),
    {
      newPassword: payload.newPassword,
    },
  );
}

export async function listTeamInvitations(
  workspaceId: string,
  params: ListTeamInvitationsParams = {},
): Promise<PageData<TeamInvitation>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    ordering: params.ordering,
    status: params.status,
    role_code: params.role_code,
    mine: params.mine ? "true" : undefined,
  });
  return api.get<PageData<TeamInvitation>>(
    workspacePath(workspaceId, `/team/email-invites${query}`),
  );
}

export async function createTeamInvitation(payload: {
  workspaceId: string;
  email: string;
  roleCode: string | null;
  joinMode?: "member" | "guest";
  expiresInSeconds?: number | null;
}): Promise<TeamInvitationCreateResult> {
  return api.post<TeamInvitationCreateResult>(
    workspacePath(payload.workspaceId, "/team/email-invites"),
    {
      email: payload.email,
      roleCode: payload.roleCode,
      joinMode: payload.joinMode,
      expiresInSeconds: payload.expiresInSeconds ?? undefined,
    },
  );
}

export async function renewTeamInvitation(
  workspaceId: string,
  invitationId: string,
  params: { expiresInSeconds?: number | null } = {},
): Promise<TeamInvitationCreateResult> {
  // Backend expects a JSON body; defaults are applied server-side.
  const body =
    params.expiresInSeconds === undefined ? {} : { expiresInSeconds: params.expiresInSeconds };
  return api.post<TeamInvitationCreateResult>(
    workspacePath(workspaceId, `/team/email-invites/${invitationId}/renew`),
    body,
  );
}

export async function deleteTeamInvitation(
  workspaceId: string,
  invitationId: string,
): Promise<null> {
  return api.delete<null>(workspacePath(workspaceId, `/team/email-invites/${invitationId}`));
}

export async function listTeamInviteLinks(
  workspaceId: string,
  params: ListTeamInviteLinksParams = {},
): Promise<PageData<TeamInviteLink>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    ordering: params.ordering,
    role_code: params.role_code,
    status: params.status,
    mine: params.mine ? "true" : undefined,
  });
  return api.get<PageData<TeamInviteLink>>(
    workspacePath(workspaceId, `/team/invite-links${query}`),
  );
}

export async function createTeamInviteLink(payload: {
  workspaceId: string;
  roleCode: string | null;
  joinMode?: "member" | "guest";
  expiresInSeconds?: number | null;
  maxUses?: number | null;
  allowedEmailDomain?: string | null;
}): Promise<TeamInviteLinkCreateResult> {
  return api.post<TeamInviteLinkCreateResult>(
    workspacePath(payload.workspaceId, "/team/invite-links"),
    {
      roleCode: payload.roleCode,
      joinMode: payload.joinMode,
      expiresInSeconds: payload.expiresInSeconds ?? undefined,
      maxUses: payload.maxUses ?? undefined,
      allowedEmailDomain: payload.allowedEmailDomain ?? undefined,
    },
  );
}

export async function renewTeamInviteLink(
  workspaceId: string,
  linkId: string,
  params: { expiresInSeconds?: number | null } = {},
): Promise<TeamInviteLinkCreateResult> {
  const body =
    params.expiresInSeconds === undefined ? {} : { expiresInSeconds: params.expiresInSeconds };
  return api.post<TeamInviteLinkCreateResult>(
    workspacePath(workspaceId, `/team/invite-links/${linkId}/renew`),
    body,
  );
}

export async function disableTeamInviteLink(workspaceId: string, linkId: string): Promise<null> {
  return api.post<null>(workspacePath(workspaceId, `/team/invite-links/${linkId}/disable`));
}

export async function listTeamInviteLinkParticipants(
  workspaceId: string,
  linkId: string,
  params: ListTeamInviteLinkParticipantsParams = {},
): Promise<PageData<TeamInviteLinkParticipant>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
  });
  return api.get<PageData<TeamInviteLinkParticipant>>(
    workspacePath(workspaceId, `/team/invite-links/${linkId}/participants${query}`),
  );
}
