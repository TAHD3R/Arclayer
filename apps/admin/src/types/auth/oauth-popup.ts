export type PendingOAuthProvider = string & {};

export type PendingOAuthState = {
  provider: PendingOAuthProvider;
  redirect: string | null;
  keepSession: boolean;
  startedAt: number;
  popupId: string;
};

export type OAuthPopupResultStatus = "success" | "error" | "closed";
export type OAuthPopupTwoFactorChallenge = {
  twoFactorToken: string;
  expiresAt: number;
  keepSession: boolean;
  redirect: string | null;
  methods?: string[];
};

export type OAuthPopupResult = {
  provider: PendingOAuthProvider;
  status: OAuthPopupResultStatus;
  redirect: string | null;
  error?: string;
  challenge?: OAuthPopupTwoFactorChallenge;
  completedAt: number;
};
