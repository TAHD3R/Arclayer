export type AuthSSOProvider = {
  provider: "google" | "github" | (string & {});
  label: string;
  startUrl?: string;
  start_url?: string;
  icon_key?: string | null;
};

export type AuthSSOProvidersOut = {
  providers: AuthSSOProvider[];
};

export type AuthSSOLinkStateOut = {
  token: string;
  expires_in: number;
};
