import { api } from "@/lib/http";
import type { PageData } from "@/api/assets";
import { workspacePath } from "@/api/_workspace";

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
  workspaceId: string;
  assetId: string;
  payload?: AdminShareCreateRequest;
}): Promise<AdminShareLink> {
  return api.post<AdminShareLink>(
    workspacePath(params.workspaceId, `/assets/${params.assetId}/share-links`),
    params.payload ?? { expiresInSeconds: null },
  );
}

export async function listAdminAssetShareLinks(params: {
  workspaceId: string;
  assetId: string;
  page?: number;
  size?: number;
}): Promise<PageData<AdminShareLink>> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("size", String(params.size ?? 50));
  const qs = query.toString();
  return api.get<PageData<AdminShareLink>>(
    workspacePath(params.workspaceId, `/assets/${params.assetId}/share-links${qs ? `?${qs}` : ""}`),
  );
}

export async function revokeAdminShareLink(params: {
  workspaceId: string;
  linkId: string;
}): Promise<AdminShareRevokeOut> {
  return api.post<AdminShareRevokeOut>(
    workspacePath(params.workspaceId, `/share-links/${params.linkId}/revoke`),
  );
}
