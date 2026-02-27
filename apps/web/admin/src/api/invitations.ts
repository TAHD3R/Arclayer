import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";
import type {
  TokenPair,
  InvitationPreviewResult,
  AcceptExistingInvitationResult,
  MyInvitation,
  PageData,
} from "@/types/api";

export async function previewInvitation(token: string): Promise<InvitationPreviewResult> {
  const query = toQueryString({ token });
  return api.get<InvitationPreviewResult>(`/auth/invitations/preview${query}`, {
    // Public endpoint: do not attempt refresh (keeps behavior consistent for invite links).
    auth: { skipRefresh: true },
  });
}

export async function acceptExistingInvitation(
  token: string,
): Promise<AcceptExistingInvitationResult> {
  return api.post<AcceptExistingInvitationResult>("/auth/invitations/accept-existing", { token });
}

export async function listMyInvitations(params: {
  page?: number;
  size?: number;
  q?: string;
  status: "pending" | "accepted";
}): Promise<PageData<MyInvitation>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    status: params.status,
    q: params.q,
  });
  return api.get<PageData<MyInvitation>>(`/auth/me/invitations${query}`);
}

export async function acceptInvitation(payload: {
  token: string;
  email?: string;
  username: string;
  password: string;
  confirmPassword: string;
  displayName?: string;
}): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/invitations/accept", payload, {
    auth: { skipRefresh: true },
  });
}
