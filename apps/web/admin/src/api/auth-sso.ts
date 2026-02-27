import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";
import type { TokenPair, AuthSSOProvidersOut } from "@/types/api";

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
