import { api } from "@/lib/http";
import { workspacePath } from "@/api/workspace-path";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

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

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        qs.append(k, String(item));
      }
      continue;
    }
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

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
  expiresInSeconds?: number | null;
}): Promise<TeamInvitationCreateResult> {
  return api.post<TeamInvitationCreateResult>(
    workspacePath(payload.workspaceId, "/team/email-invites"),
    {
      email: payload.email,
      roleCode: payload.roleCode,
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

export type TeamUserRef = {
  userId: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
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

export async function listTeamInviteLinks(
  workspaceId: string,
  params: ListTeamInviteLinksParams = {},
): Promise<PageData<TeamInviteLink>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    ordering: params.ordering,
    mine: params.mine ? "true" : undefined,
  });
  return api.get<PageData<TeamInviteLink>>(
    workspacePath(workspaceId, `/team/invite-links${query}`),
  );
}

export async function createTeamInviteLink(payload: {
  workspaceId: string;
  roleCode: string | null;
  expiresInSeconds?: number | null;
  maxUses?: number | null;
  allowedEmailDomain?: string | null;
}): Promise<TeamInviteLinkCreateResult> {
  return api.post<TeamInviteLinkCreateResult>(
    workspacePath(payload.workspaceId, "/team/invite-links"),
    {
      roleCode: payload.roleCode,
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
