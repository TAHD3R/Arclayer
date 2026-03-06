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
};

export type ConfirmMyEmailChangePayload = {
  new_email: string;
  code: string;
  password: string;
};

export type DeleteMyAccountPayload = {
  email: string;
  password: string;
};

export type ResetTokenPayload = {
  reset_token: string;
  expires_in: number;
};

export type RegisterPayload = {
  username: string;
  email?: string;
  password: string;
  confirm_password: string;
  display_name?: string;
};
