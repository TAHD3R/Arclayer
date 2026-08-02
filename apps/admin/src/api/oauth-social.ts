import { api } from "@/lib/http";
import type { OAuthLinkedIdentityListOut } from "@arclayer/openapi";

export async function listMyOAuthIdentities(): Promise<OAuthLinkedIdentityListOut> {
  return api.get<OAuthLinkedIdentityListOut>("/auth/sso/me/identities");
}

export async function unlinkMyOAuthIdentity(provider: string): Promise<null> {
  const key = String(provider || "").trim();
  return api.delete<null>(`/auth/sso/me/identities/${encodeURIComponent(key)}`);
}
