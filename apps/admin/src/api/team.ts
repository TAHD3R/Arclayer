import { api } from "@/lib/http";
import { workspacePath, toQueryString } from "@/lib/api";

import type {
  WorkspaceMembershipStatus as MembershipStatus,
  WorkspaceTeamMemberOut as TeamMember,
  DomainWorkspacesListMembersData,
  WorkspaceEmailInviteCreateResult as TeamInvitationCreateResult,
  DomainWorkspacesListEmailInvitesData,
  WorkspaceInviteLinkCreateResult as TeamInviteLinkCreateResult,
  DomainWorkspacesListInviteLinksData,
  DomainWorkspacesListInviteLinkParticipantsData,
  PageDataWorkspaceTeamMemberOut,
  PageDataWorkspaceTeamUserOptionOut,
  PageDataWorkspaceEmailInviteOut,
  PageDataWorkspaceInviteLinkOut,
  PageDataWorkspaceInviteLinkParticipantOut,
} from "@arclayer/openapi";

type ListTeamMembersParams = NonNullable<DomainWorkspacesListMembersData["query"]>;
type ListTeamInvitationsParams = NonNullable<DomainWorkspacesListEmailInvitesData["query"]>;
type ListTeamInviteLinksParams = NonNullable<DomainWorkspacesListInviteLinksData["query"]>;
type ListTeamInviteLinkParticipantsParams = NonNullable<
  DomainWorkspacesListInviteLinkParticipantsData["query"]
>;
type TeamPage =
  | PageDataWorkspaceTeamMemberOut
  | PageDataWorkspaceTeamUserOptionOut
  | PageDataWorkspaceEmailInviteOut
  | PageDataWorkspaceInviteLinkOut
  | PageDataWorkspaceInviteLinkParticipantOut;
type RequiredTeamPage<TPage extends TeamPage> = Omit<TPage, "items"> & {
  items: NonNullable<TPage["items"]>;
};

function requireTeamPage<TPage extends TeamPage>(page: TPage): RequiredTeamPage<TPage> {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid team pagination response");
  }
  return { ...page, items: page.items };
}

export async function listTeamMembers(
  workspaceId: string,
  params: ListTeamMembersParams = {},
): Promise<RequiredTeamPage<PageDataWorkspaceTeamMemberOut>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    status: params.status,
    roleCode: params.roleCode,
    userStatus: params.userStatus,
    ordering: params.ordering,
  });
  const page = await api.get<PageDataWorkspaceTeamMemberOut>(
    workspacePath(workspaceId, `/team/members${query}`),
  );
  return requireTeamPage(page);
}

export async function listTeamUserOptions(
  workspaceId: string,
  params: { page?: number; size?: number; q?: string } = {},
): Promise<RequiredTeamPage<PageDataWorkspaceTeamUserOptionOut>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
  });
  const page = await api.get<PageDataWorkspaceTeamUserOptionOut>(
    workspacePath(workspaceId, `/team/users/options${query}`),
  );
  return requireTeamPage(page);
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
): Promise<RequiredTeamPage<PageDataWorkspaceEmailInviteOut>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    ordering: params.ordering,
    status: params.status,
    role_code: params.role_code,
    mine: params.mine,
  });
  const page = await api.get<PageDataWorkspaceEmailInviteOut>(
    workspacePath(workspaceId, `/team/email-invites${query}`),
  );
  return requireTeamPage(page);
}

export async function createTeamInvitation(
  payload: {
    workspaceId: string;
    email: string;
    joinMode?: "member" | "guest";
    expiresInSeconds?: number | null;
  } & ({ roleCode: string; access?: never } | { access: "fixed-member"; roleCode?: never }),
): Promise<TeamInvitationCreateResult> {
  return api.post<TeamInvitationCreateResult>(
    workspacePath(payload.workspaceId, "/team/email-invites"),
    {
      email: payload.email,
      ...(payload.access === "fixed-member" ? {} : { roleCode: payload.roleCode }),
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
): Promise<RequiredTeamPage<PageDataWorkspaceInviteLinkOut>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    ordering: params.ordering,
    role_code: params.role_code,
    status: params.status,
    mine: params.mine,
  });
  const page = await api.get<PageDataWorkspaceInviteLinkOut>(
    workspacePath(workspaceId, `/team/invite-links${query}`),
  );
  return requireTeamPage(page);
}

export async function createTeamInviteLink(
  payload: {
    workspaceId: string;
    joinMode?: "member" | "guest";
    expiresInSeconds?: number | null;
    maxUses?: number | null;
    allowedEmailDomain?: string | null;
  } & ({ roleCode: string; access?: never } | { access: "fixed-member"; roleCode?: never }),
): Promise<TeamInviteLinkCreateResult> {
  return api.post<TeamInviteLinkCreateResult>(
    workspacePath(payload.workspaceId, "/team/invite-links"),
    {
      ...(payload.access === "fixed-member" ? {} : { roleCode: payload.roleCode }),
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
): Promise<RequiredTeamPage<PageDataWorkspaceInviteLinkParticipantOut>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
  });
  const page = await api.get<PageDataWorkspaceInviteLinkParticipantOut>(
    workspacePath(workspaceId, `/team/invite-links/${linkId}/participants${query}`),
  );
  return requireTeamPage(page);
}
