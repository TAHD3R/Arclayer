export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer" | string;
  expires_in: number;
  refresh_expires_in: number;
};

export type UserProfile = {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarAssetId: string | null;
  avatarAssetAligned?: boolean;
  isSuperAdmin: boolean;
  // Back-compat: some environments may still return snake_case.
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_asset_id?: string | null;
};

export type UpdateMyProfilePayload = {
  display_name?: string | null;
  displayName?: string | null;
  avatar_asset_id?: string | null;
  avatarAssetId?: string | null;
};

export type RequestMyEmailChangePayload = {
  new_email: string;
};

export type RequestMyEmailChangeOut = {
  expires_in: number;
  retryAfter: number;
  retry_after?: number;
};

export type ConfirmMyEmailChangePayload = {
  new_email: string;
  code: string;
};

export type DeleteMyAccountReauthMethod = "password" | "2fa" | "relogin";

export type MySecurityCapability = {
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  setPasswordRequiredReauthMethods: DeleteMyAccountReauthMethod[];
  emailChangeRequiredReauthMethods: DeleteMyAccountReauthMethod[];
  hasLinkedOauthIdentities: boolean;
  has_password?: boolean;
  two_factor_enabled?: boolean;
  set_password_required_reauth_methods?: DeleteMyAccountReauthMethod[];
  email_change_required_reauth_methods?: DeleteMyAccountReauthMethod[];
  has_linked_oauth_identities?: boolean;
};

export type SetMyPasswordPayload = {
  new_password: string;
  code?: string;
  backup_code?: string;
};

export type RequestRemoveMyPasswordPayload = {
  current_password: string;
};

export type ConfirmRemoveMyPasswordPayload = {
  code: string;
};

export type DeleteMyAccountPayload = {
  email: string;
  password?: string;
  code?: string;
  backupCode?: string;
};

export type DeleteMyAccountCapability = {
  email: string | null;
  canDelete: boolean;
  blockedReason: string | null;
  requiredReauthMethods: DeleteMyAccountReauthMethod[];
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  hasLinkedOauthIdentities: boolean;
};

export type ResetTokenPayload = {
  reset_token: string;
  expires_in: number;
};

export type EmailCheckOut = {
  exists: boolean;
  passwordLoginAvailable?: boolean;
  password_login_available?: boolean;
};

export type UsernameCheckOut = {
  available: boolean;
};

export type LoginEmailCodeRequestOut = {
  expiresIn: number;
  retryAfter: number;
  expires_in?: number;
  retry_after?: number;
};

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
  display_name: string;
};

export type TwoFactorChallengeMeta = {
  twoFactorToken: string;
  expiresIn: number;
  two_factor_token?: string;
  expires_in?: number;
};

export type TwoFactorReauthMethod = "password" | "relogin" | "totp" | "backup_code";

export type TwoFactorCapabilities = {
  enabled: boolean;
  canSetup: boolean;
  setupRequiredReauthMethods: TwoFactorReauthMethod[];
  disableRequiredReauthMethods: TwoFactorReauthMethod[];
  regenerateBackupCodesRequiredReauthMethods: TwoFactorReauthMethod[];
  hasPassword: boolean;
  can_setup?: boolean;
  setup_required_reauth_methods?: TwoFactorReauthMethod[];
  disable_required_reauth_methods?: TwoFactorReauthMethod[];
  regenerate_backup_codes_required_reauth_methods?: TwoFactorReauthMethod[];
  has_password?: boolean;
};

export type TwoFactorStatus = {
  enabled: boolean;
  backupCodesRemaining: number;
  backup_codes_remaining?: number;
};

export type TwoFactorSetupResult = {
  secret: string;
  otpauthUri: string;
  otpauth_uri?: string;
};

export type TwoFactorBackupCodesResult = {
  backupCodes: string[];
  backup_codes?: string[];
};

export type AuthSessionRow = {
  sessionId: string;
  issuedAt: string;
  lastUsedAt: string | null;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  locationLabel: string | null;
  authMethod: string | null;
  revocable: boolean;
  session_id?: string;
  issued_at?: string;
  last_used_at?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  device_label?: string | null;
  location_label?: string | null;
  auth_method?: string | null;
};

export type AuthSessionList = {
  items: AuthSessionRow[];
  total: number;
};

export type AuthSessionRevokeOthersResult = {
  revokedCount: number;
  revoked_count?: number;
};
