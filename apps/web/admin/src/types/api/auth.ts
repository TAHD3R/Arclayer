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
  display_name: string | null;
  avatar_url: string | null;
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
