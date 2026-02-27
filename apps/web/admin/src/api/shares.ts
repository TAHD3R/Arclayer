import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";
import type {
  PageData,
  AdminShareCreateRequest,
  AdminShareLink,
  AdminShareRevokeOut,
} from "@/types/api";

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
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 50 });
  return api.get<PageData<AdminShareLink>>(
    workspacePath(params.workspaceId, `/assets/${params.assetId}/share-links${query}`),
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
