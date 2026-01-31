import { api } from "@/lib/http";
import type { TokenPair } from "@/api/auth";

export interface InvitationPreviewInvitation {
  email: string;
  maskedEmail: string;
  roleCode: string | null;
  expiresAt: string | null;
}

export interface InvitationPreviewOrganization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface InvitationPreviewInviter {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface InvitationPreviewRole {
  code: string;
  name: string;
  description: string | null;
}

export interface InvitationPreviewResult {
  invitation: InvitationPreviewInvitation;
  organization: InvitationPreviewOrganization;
  inviter: InvitationPreviewInviter | null;
  role: InvitationPreviewRole;
  userExists: boolean;
}

export async function previewInvitation(token: string): Promise<InvitationPreviewResult> {
  const q = encodeURIComponent(token);
  return api.get<InvitationPreviewResult>(`/auth/invitations/preview?token=${q}`, {
    // Public endpoint: do not attempt refresh (keeps behavior consistent for invite links).
    auth: { skipRefresh: true },
  });
}

export interface AcceptExistingInvitationResult {
  organizationId: string;
  roleCode: string | null;
}

export async function acceptExistingInvitation(
  token: string,
): Promise<AcceptExistingInvitationResult> {
  return api.post<AcceptExistingInvitationResult>("/auth/invitations/accept-existing", { token });
}

export async function acceptInvitation(payload: {
  token: string;
  username: string;
  password: string;
  confirmPassword: string;
  displayName?: string;
}): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/invitations/accept", payload, {
    auth: { skipRefresh: true },
  });
}
