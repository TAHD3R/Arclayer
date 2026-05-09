import { api } from "@/lib/http";
import { projectPath, toQueryString } from "@/lib/api";
import type {
  PageData,
  AdminAssetSummary,
  AdminAssetFolder,
  AdminAssetTag,
  AdminAssetDetail,
  PatchAdminAssetPayload,
  ListAdminAssetsParams,
  AdminAssetFolderCreateRequest,
  AdminAssetFolderDeleteRequest,
  AdminAssetFolderUpdateRequest,
  AdminAssetFolderDeleteOut,
  AdminAssetDeleteOut,
  AdminAssetMoveRequest,
  AdminAssetsBulkMoveRequest,
  AdminAssetsBulkMoveOut,
  AdminAssetsBulkDeleteRequest,
  AdminAssetsBulkDeleteOut,
  AdminAssetsBulkUpdateRequest,
  AdminAssetsBulkUpdateOut,
} from "@arclayer/openapi/admin-types";

export async function listAssets(
  projectId: string,
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
  return api.get<PageData<AdminAssetSummary>>(projectPath(projectId, `/assets${query}`));
}

export async function listAssetFolders(
  projectId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<AdminAssetFolder>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  return api.get<PageData<AdminAssetFolder>>(projectPath(projectId, `/asset-folders${query}`));
}

export async function createAssetFolder(
  projectId: string,
  payload: AdminAssetFolderCreateRequest,
): Promise<AdminAssetFolder> {
  return api.post<AdminAssetFolder>(projectPath(projectId, "/asset-folders"), {
    name: payload.name,
    parentId: payload.parentId ?? null,
    description: payload.description ?? null,
    sortOrder: payload.sortOrder ?? 0,
  });
}

export async function updateAssetFolder(
  projectId: string,
  folderId: string,
  payload: AdminAssetFolderUpdateRequest,
): Promise<AdminAssetFolder> {
  return api.put<AdminAssetFolder>(projectPath(projectId, `/asset-folders/${folderId}`), payload);
}

export async function deleteAssetFolder(
  projectId: string,
  folderId: string,
): Promise<AdminAssetFolderDeleteOut> {
  return api.delete<AdminAssetFolderDeleteOut>(
    projectPath(projectId, `/asset-folders/${folderId}`),
  );
}

export async function deleteAssetFolderWithMove(
  projectId: string,
  folderId: string,
  payload: AdminAssetFolderDeleteRequest,
): Promise<AdminAssetFolderDeleteOut> {
  return api.post<AdminAssetFolderDeleteOut>(
    projectPath(projectId, `/asset-folders/${folderId}/delete`),
    {
      destinationFolderId: payload.destinationFolderId ?? null,
    },
  );
}

export async function listAssetTags(
  projectId: string,
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
  return api.get<PageData<AdminAssetTag>>(projectPath(projectId, `/asset-tags${query}`));
}

export async function createAssetTag(
  projectId: string,
  payload: { name: string },
): Promise<AdminAssetTag> {
  return api.post<AdminAssetTag>(projectPath(projectId, "/asset-tags"), payload);
}

export async function getAssetDetail(
  projectId: string,
  assetId: string,
): Promise<AdminAssetDetail> {
  return api.get<AdminAssetDetail>(projectPath(projectId, `/assets/${assetId}`));
}

export async function patchAsset(
  projectId: string,
  assetId: string,
  payload: PatchAdminAssetPayload,
): Promise<AdminAssetDetail> {
  return api.patch<AdminAssetDetail>(projectPath(projectId, `/assets/${assetId}`), payload);
}

export async function deleteAsset(
  projectId: string,
  assetId: string,
): Promise<AdminAssetDeleteOut> {
  return api.delete<AdminAssetDeleteOut>(projectPath(projectId, `/assets/${assetId}`));
}

export async function moveAsset(
  projectId: string,
  assetId: string,
  payload: AdminAssetMoveRequest,
): Promise<AdminAssetSummary> {
  return api.put<AdminAssetSummary>(projectPath(projectId, `/assets/${assetId}/move`), payload);
}

export async function bulkMoveAssets(
  projectId: string,
  payload: AdminAssetsBulkMoveRequest,
): Promise<AdminAssetsBulkMoveOut> {
  return api.put<AdminAssetsBulkMoveOut>(projectPath(projectId, `/assets/bulk/move`), payload);
}

export async function bulkDeleteAssets(
  projectId: string,
  payload: AdminAssetsBulkDeleteRequest,
): Promise<AdminAssetsBulkDeleteOut> {
  return api.post<AdminAssetsBulkDeleteOut>(projectPath(projectId, `/assets/bulk/delete`), payload);
}

export async function bulkUpdateAssets(
  projectId: string,
  payload: AdminAssetsBulkUpdateRequest,
): Promise<AdminAssetsBulkUpdateOut> {
  return api.put<AdminAssetsBulkUpdateOut>(projectPath(projectId, `/assets/bulk/update`), payload);
}
