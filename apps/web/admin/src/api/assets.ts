import { api } from "@/lib/http";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type AdminAssetSummary = {
  id: string;
  purpose: string;
  visibility: "public" | "private" | "shared" | string;
  indexable: boolean;
  ownerUserId?: string | null;
  uploaderName?: string | null;
  title?: string | null;
  slug?: string | null;
  originalFilename?: string | null;
  mime?: string | null;
  ext?: string | null;
  sizeBytes: number;
  checksumSha256?: string | null;
  folderId?: string | null;
  createdAt: string;

  // Computed fields (from backend):
  contentUrlPath: string;
  publicUrlPath?: string | null;
  publicDownloadUrlPath?: string | null;
  publicThumbUrlPath?: string | null;
};

export type AdminAssetFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  createdAt: string;
};

export type AdminAssetTag = {
  id: string;
  name: string;
  createdAt: string;
};

export type AdminAssetDetail = AdminAssetSummary & {
  description?: string | null;
  tags: AdminAssetTag[];
};

export type PatchAdminAssetPayload = {
  description?: string | null;
  tagIds?: string[];
};

export type ListAdminAssetsParams = {
  page?: number;
  size?: number;
  q?: string;
  purpose?: string;
  visibility?: string;
  indexable?: boolean;
  folderId?: string | null;
  includeChildren?: boolean;
  mimePrefix?: string;
  createdFrom?: string;
  createdTo?: string;
  tagIds?: string[];
  ordering?: string;
};

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        qs.append(k, String(item));
      }
      continue;
    }
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function listAdminAssets(
  params: ListAdminAssetsParams = {},
): Promise<PageData<AdminAssetSummary>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 24,
    q: params.q,
    purpose: params.purpose,
    visibility: params.visibility,
    indexable: params.indexable,
    folderId: params.folderId,
    includeChildren: params.includeChildren,
    mimePrefix: params.mimePrefix,
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
    tagIds: params.tagIds,
    ordering: params.ordering,
  });
  return api.get<PageData<AdminAssetSummary>>(`/admin/assets${query}`);
}

export async function listAdminAssetFolders(
  params: { page?: number; size?: number } = {},
): Promise<PageData<AdminAssetFolder>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  return api.get<PageData<AdminAssetFolder>>(`/admin/asset-folders${query}`);
}

export async function listAdminAssetTags(
  params: {
    q?: string;
    page?: number;
    size?: number;
  } = {},
): Promise<PageData<AdminAssetTag>> {
  const query = toQueryString({
    q: params.q,
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  return api.get<PageData<AdminAssetTag>>(`/admin/asset-tags${query}`);
}

export async function createAdminAssetTag(payload: { name: string }): Promise<AdminAssetTag> {
  return api.post<AdminAssetTag>(`/admin/asset-tags`, payload);
}

export async function getAdminAssetDetail(assetId: string): Promise<AdminAssetDetail> {
  return api.get<AdminAssetDetail>(`/admin/assets/${assetId}`);
}

export async function patchAdminAsset(
  assetId: string,
  payload: PatchAdminAssetPayload,
): Promise<AdminAssetDetail> {
  return api.patch<AdminAssetDetail>(`/admin/assets/${assetId}`, payload);
}

export type AdminAssetDeleteOut = {
  id: string;
  deletedAt: string;
};

export async function deleteAdminAsset(assetId: string): Promise<AdminAssetDeleteOut> {
  return api.delete<AdminAssetDeleteOut>(`/admin/assets/${assetId}`);
}

export type AdminAssetMoveRequest = {
  folderId?: string | null;
};

export async function moveAdminAsset(
  assetId: string,
  payload: AdminAssetMoveRequest,
): Promise<AdminAssetSummary> {
  return api.put<AdminAssetSummary>(`/admin/assets/${assetId}/move`, payload);
}

export type AdminAssetsBulkMoveRequest = {
  assetIds: string[];
  folderId?: string | null;
};

export type AdminAssetsBulkMoveOut = {
  movedCount: number;
  folderId?: string | null;
  movedAssetIds: string[];
};

export async function bulkMoveAdminAssets(
  payload: AdminAssetsBulkMoveRequest,
): Promise<AdminAssetsBulkMoveOut> {
  return api.put<AdminAssetsBulkMoveOut>(`/admin/assets/bulk/move`, payload);
}

export type AdminAssetsBulkDeleteRequest = {
  assetIds: string[];
};

export type AdminAssetsBulkDeleteOut = {
  deletedCount: number;
  deletedAssetIds: string[];
};

export async function bulkDeleteAdminAssets(
  payload: AdminAssetsBulkDeleteRequest,
): Promise<AdminAssetsBulkDeleteOut> {
  return api.post<AdminAssetsBulkDeleteOut>(`/admin/assets/bulk/delete`, payload);
}
