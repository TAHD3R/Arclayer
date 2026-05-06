import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";
import type { TokenPair } from "@arclayer/openapi/admin-types";
import type { AuthSSOProvidersOut, AuthSSOLinkStateOut } from "@arclayer/openapi/admin-types";

export async function listSSOProviders(input?: {
  redirect?: string;
}): Promise<AuthSSOProvidersOut> {
  const query = toQueryString({ redirect: input?.redirect });
  return api.get<AuthSSOProvidersOut>(`/auth/sso/providers${query}`, {
    auth: { skipRefresh: true },
  });
}

export async function exchangeSSOCode(code: string): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/sso/exchange", { code }, { auth: { skipRefresh: true } });
}

export async function issueSSOLinkState(): Promise<AuthSSOLinkStateOut> {
  return api.post<AuthSSOLinkStateOut>("/auth/sso/link-state");
}
