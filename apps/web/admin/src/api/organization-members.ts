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

export type OrganizationMember = {
  id: string;
  membershipId: string;
  organizationId: string;
  role: OrgRole;
  status: string;
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  joinedAt: string;
};

export type OrganizationInviteResult = {
  invitationId: string;
  email: string;
  role: OrgRole;
  workspaceId: string;
  token: string;
  inviteUrl: string | null;
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

export async function listOrganizationMembers(params: {
  page?: number;
  size?: number;
  q?: string;
}): Promise<PageData<OrganizationMember>> {
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 20, q: params.q });
  return api.get<PageData<OrganizationMember>>(`/organizations/me/members${query}`);
}

export async function inviteOrganizationMember(payload: {
  email: string;
  role: OrgRole;
  expiresInSeconds?: number;
}): Promise<OrganizationInviteResult> {
  return api.post<OrganizationInviteResult>("/organizations/me/invitations", payload);
}

export async function patchOrganizationMemberRole(
  membershipId: string,
  payload: { role: OrgRole },
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
