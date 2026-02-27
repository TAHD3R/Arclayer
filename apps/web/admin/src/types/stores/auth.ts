export interface AuthState {
  keepSession: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresIn: number | null;
  refreshExpiresIn: number | null;
  setAccessToken: (token: string | null) => void;
  setTokens: (tokens: unknown | null) => void;
  setKeepSession: (keepSession: boolean) => void;
  applyLogin: (tokens: unknown, options: { keepSession: boolean }) => void;
  clear: () => void;
}
