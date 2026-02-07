import { api } from "@/lib/http";

import type { TokenPair } from "@/api/auth";

export type AuthSSOProvider = {
  provider: "google" | "github" | (string & {});
  label: string;
  start_url: string;
  icon_key?: string | null;
};

export type AuthSSOProvidersOut = {
  providers: AuthSSOProvider[];
};

export async function listSSOProviders(input?: { redirect?: string }): Promise<AuthSSOProvidersOut> {
  const redirect = input?.redirect;
  const qs = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  return api.get<AuthSSOProvidersOut>(`/auth/sso/providers${qs}`, { auth: { skipRefresh: true } });
}

export async function exchangeSSOCode(code: string): Promise<TokenPair> {
  return api.post<TokenPair>(
    "/auth/sso/exchange",
    { code },
    { auth: { skipRefresh: true } },
  );
}

