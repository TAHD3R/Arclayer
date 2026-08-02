import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";
import type { TokenPair } from "@arclayer/openapi";
import type {
  AuthSsoProviderItem,
  AuthSsoProvidersOut,
  AuthSsoLinkStateOut as AuthSSOLinkStateOut,
} from "@arclayer/openapi";

type AuthSSOProvidersOut = Omit<AuthSsoProvidersOut, "providers"> & {
  providers: AuthSsoProviderItem[];
};

function requireSSOProviders(response: AuthSsoProvidersOut): AuthSSOProvidersOut {
  if (!Array.isArray(response.providers)) {
    throw new Error("Invalid SSO providers response");
  }
  return { ...response, providers: response.providers };
}

export async function listSSOProviders(input?: {
  redirect?: string;
}): Promise<AuthSSOProvidersOut> {
  const query = toQueryString({ redirect: input?.redirect });
  const response = await api.get<AuthSsoProvidersOut>(`/auth/sso/providers${query}`, {
    auth: { skipRefresh: true },
  });
  return requireSSOProviders(response);
}

export async function exchangeSSOCode(code: string): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/sso/exchange", { code }, { auth: { skipRefresh: true } });
}

export async function issueSSOLinkState(): Promise<AuthSSOLinkStateOut> {
  return api.post<AuthSSOLinkStateOut>("/auth/sso/link-state");
}
