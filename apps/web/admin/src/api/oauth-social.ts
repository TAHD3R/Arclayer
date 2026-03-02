import { api } from "@/lib/http";
import type { OAuthLinkedIdentityListOut } from "@/types/api";

export async function listMyOAuthIdentities(): Promise<OAuthLinkedIdentityListOut> {
  return api.get<OAuthLinkedIdentityListOut>("/plugins/oauth/me/identities");
}

export async function unlinkMyOAuthIdentity(provider: string): Promise<null> {
  const key = String(provider || "").trim();
  return api.delete<null>(`/plugins/oauth/me/identities/${encodeURIComponent(key)}`);
}
