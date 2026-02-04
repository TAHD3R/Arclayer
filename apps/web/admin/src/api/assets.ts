import { api } from "@/lib/http";
import { workspacePath } from "@/api/workspace-path";

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
  description?: string | null;
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
  visibility?: string;
  purpose?: string;
};

export type ListAdminAssetsParams = {
  page?: number;
  size?: number;
  q?: string;
  purpose?: string;
  visibility?: string;
  indexable?: boolean;
  folderId?: string | null;
  /**
   * When true and folderId is not provided, only return assets in root (folder_id IS NULL).
   * This avoids showing the same asset both in root and inside its folder.
   */
  folderIsNull?: boolean;
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

export async function listAssets(
  workspaceId: string,
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
    folderIsNull: params.folderIsNull,
    includeChildren: params.includeChildren,
    mimePrefix: params.mimePrefix,
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
    tagIds: params.tagIds,
    ordering: params.ordering,
  });
  return api.get<PageData<AdminAssetSummary>>(workspacePath(workspaceId, `/assets${query}`));
}

export async function listAssetFolders(
  workspaceId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<AdminAssetFolder>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  return api.get<PageData<AdminAssetFolder>>(workspacePath(workspaceId, `/asset-folders${query}`));
}

export type AdminAssetFolderCreateRequest = {
  name: string;
  parentId?: string | null;
  description?: string | null;
  sortOrder?: number;
};

export async function createAssetFolder(
  workspaceId: string,
  payload: AdminAssetFolderCreateRequest,
): Promise<AdminAssetFolder> {
  return api.post<AdminAssetFolder>(workspacePath(workspaceId, "/asset-folders"), {
    name: payload.name,
    parentId: payload.parentId ?? null,
    description: payload.description ?? null,
    sortOrder: payload.sortOrder ?? 0,
  });
}

export type AdminAssetFolderUpdateRequest = {
  name?: string | null;
  parentId?: string | null;
  description?: string | null;
  sortOrder?: number;
};

export async function updateAssetFolder(
  workspaceId: string,
  folderId: string,
  payload: AdminAssetFolderUpdateRequest,
): Promise<AdminAssetFolder> {
  return api.put<AdminAssetFolder>(
    workspacePath(workspaceId, `/asset-folders/${folderId}`),
    payload,
  );
}

export type AdminAssetFolderDeleteOut = {
  id: string;
};

export async function deleteAssetFolder(
  workspaceId: string,
  folderId: string,
): Promise<AdminAssetFolderDeleteOut> {
  return api.delete<AdminAssetFolderDeleteOut>(
    workspacePath(workspaceId, `/asset-folders/${folderId}`),
  );
}

export async function listAssetTags(
  workspaceId: string,
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
  return api.get<PageData<AdminAssetTag>>(workspacePath(workspaceId, `/asset-tags${query}`));
}

export async function createAssetTag(
  workspaceId: string,
  payload: { name: string },
): Promise<AdminAssetTag> {
  return api.post<AdminAssetTag>(workspacePath(workspaceId, "/asset-tags"), payload);
}

export async function getAssetDetail(
  workspaceId: string,
  assetId: string,
): Promise<AdminAssetDetail> {
  return api.get<AdminAssetDetail>(workspacePath(workspaceId, `/assets/${assetId}`));
}

export async function patchAsset(
  workspaceId: string,
  assetId: string,
  payload: PatchAdminAssetPayload,
): Promise<AdminAssetDetail> {
  return api.patch<AdminAssetDetail>(workspacePath(workspaceId, `/assets/${assetId}`), payload);
}

export type AdminAssetDeleteOut = {
  id: string;
  deletedAt: string;
};

export async function deleteAsset(
  workspaceId: string,
  assetId: string,
): Promise<AdminAssetDeleteOut> {
  return api.delete<AdminAssetDeleteOut>(workspacePath(workspaceId, `/assets/${assetId}`));
}

export type AdminAssetMoveRequest = {
  folderId?: string | null;
};

export async function moveAsset(
  workspaceId: string,
  assetId: string,
  payload: AdminAssetMoveRequest,
): Promise<AdminAssetSummary> {
  return api.put<AdminAssetSummary>(workspacePath(workspaceId, `/assets/${assetId}/move`), payload);
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

export async function bulkMoveAssets(
  workspaceId: string,
  payload: AdminAssetsBulkMoveRequest,
): Promise<AdminAssetsBulkMoveOut> {
  return api.put<AdminAssetsBulkMoveOut>(workspacePath(workspaceId, `/assets/bulk/move`), payload);
}

export type AdminAssetsBulkDeleteRequest = {
  assetIds: string[];
};

export type AdminAssetsBulkDeleteOut = {
  deletedCount: number;
  deletedAssetIds: string[];
};

export async function bulkDeleteAssets(
  workspaceId: string,
  payload: AdminAssetsBulkDeleteRequest,
): Promise<AdminAssetsBulkDeleteOut> {
  return api.post<AdminAssetsBulkDeleteOut>(
    workspacePath(workspaceId, `/assets/bulk/delete`),
    payload,
  );
}

export type AdminAssetsBulkUpdateRequest = {
  assetIds: string[];
  visibility?: string;
  purpose?: string;
};

export type AdminAssetsBulkUpdateOut = {
  updatedCount: number;
  updatedAssetIds: string[];
  visibility?: string;
  purpose?: string;
};

export async function bulkUpdateAssets(
  workspaceId: string,
  payload: AdminAssetsBulkUpdateRequest,
): Promise<AdminAssetsBulkUpdateOut> {
  return api.put<AdminAssetsBulkUpdateOut>(
    workspacePath(workspaceId, `/assets/bulk/update`),
    payload,
  );
}
