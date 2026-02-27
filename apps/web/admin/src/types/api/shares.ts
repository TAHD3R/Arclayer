export type AdminShareCreateRequest = {
  /** 过期秒数；null 表示永不过期 */
  expiresInSeconds?: number | null;
};

export type AdminShareLink = {
  id: string;
  assetId: string;
  token: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  previewUrlPath: string;
  downloadUrlPath: string;
};

export type AdminShareRevokeOut = {
  id: string;
  revokedAt: string;
};
