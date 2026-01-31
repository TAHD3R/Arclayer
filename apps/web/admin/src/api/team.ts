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
  invitedByUserId: string | null;
  acceptedByUserId: string | null;
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
  status?: InvitationStatus;
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
  return api.get<PageData<TeamMember>>(`/admin/team/members${query}`);
}

export async function setTeamMemberRoles(
  membershipId: string,
  payload: { roleCodes: string[] },
): Promise<null> {
  return api.put<null>(`/admin/team/members/${membershipId}/roles`, payload);
}

export async function listTeamInvitations(
  params: ListTeamInvitationsParams = {},
): Promise<PageData<TeamInvitation>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    status: params.status,
  });
  return api.get<PageData<TeamInvitation>>(`/admin/team/invitations${query}`);
}

export async function createTeamInvitation(payload: {
  email: string;
  roleCode: string | null;
  expiresInSeconds?: number | null;
}): Promise<TeamInvitationCreateResult> {
  return api.post<TeamInvitationCreateResult>("/admin/team/invitations", {
    email: payload.email,
    roleCode: payload.roleCode,
    expiresInSeconds: payload.expiresInSeconds ?? undefined,
  });
}

export async function revokeTeamInvitation(invitationId: string): Promise<null> {
  return api.post<null>(`/admin/team/invitations/${invitationId}/revoke`);
}

export async function renewTeamInvitation(
  invitationId: string,
  params: { expiresInSeconds?: number | null } = {},
): Promise<TeamInvitation> {
  // Backend expects a JSON body; defaults are applied server-side.
  const body =
    params.expiresInSeconds === undefined ? {} : { expiresInSeconds: params.expiresInSeconds };
  return api.post<TeamInvitation>(`/admin/team/invitations/${invitationId}/renew`, body);
}

export async function deleteTeamInvitation(invitationId: string): Promise<null> {
  return api.delete<null>(`/admin/team/invitations/${invitationId}`);
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
  code: string;
  roleCode: string | null;
  expiresAt: string | null;
  disabledAt: string | null;

  createdBy: TeamUserRef | null;
  lastUsedBy: TeamUserRef | null;
  lastUsedAt: string | null;
  usesCount: number;

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
  mine?: boolean;
};

export async function listTeamInviteLinks(
  params: ListTeamInviteLinksParams = {},
): Promise<PageData<TeamInviteLink>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    mine: params.mine ? "true" : undefined,
  });
  return api.get<PageData<TeamInviteLink>>(`/admin/team/invite-links${query}`);
}

export async function createTeamInviteLink(payload: {
  roleCode: string | null;
  expiresInSeconds?: number | null;
  emails?: string[];
}): Promise<TeamInviteLinkCreateResult> {
  return api.post<TeamInviteLinkCreateResult>("/admin/team/invite-links", {
    roleCode: payload.roleCode,
    expiresInSeconds: payload.expiresInSeconds ?? undefined,
    emails: payload.emails?.length ? payload.emails : undefined,
  });
}

export async function renewTeamInviteLink(
  linkId: string,
  params: { expiresInSeconds?: number | null } = {},
): Promise<TeamInviteLink> {
  const body =
    params.expiresInSeconds === undefined ? {} : { expiresInSeconds: params.expiresInSeconds };
  return api.post<TeamInviteLink>(`/admin/team/invite-links/${linkId}/renew`, body);
}

export async function disableTeamInviteLink(linkId: string): Promise<null> {
  return api.post<null>(`/admin/team/invite-links/${linkId}/disable`);
}

export async function disableAllTeamInviteLinks(): Promise<null> {
  return api.post<null>("/admin/team/invite-links/disable-all");
}
