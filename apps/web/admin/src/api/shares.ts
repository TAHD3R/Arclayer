import { api } from "@/lib/http";

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

export async function createAdminAssetShareLink(params: {
  assetId: string;
  payload?: AdminShareCreateRequest;
}): Promise<AdminShareLink> {
  return api.post<AdminShareLink>(
    `/admin/assets/${params.assetId}/share-links`,
    params.payload ?? { expiresInSeconds: null },
  );
}

export async function listAdminAssetShareLinks(assetId: string): Promise<AdminShareLink[]> {
  return api.get<AdminShareLink[]>(`/admin/assets/${assetId}/share-links`);
}

export async function revokeAdminShareLink(linkId: string): Promise<AdminShareRevokeOut> {
  return api.post<AdminShareRevokeOut>(`/admin/share-links/${linkId}/revoke`);
}
