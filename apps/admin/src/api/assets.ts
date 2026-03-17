import { api } from "@/lib/http";
import { organizationPath, workspacePath, toQueryString } from "@/lib/api";
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
} from "@/types/api";

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

export async function listOrganizationAssets(
  organizationId: string,
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
  return api.get<PageData<AdminAssetSummary>>(organizationPath(organizationId, `/assets${query}`));
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

export async function listOrganizationAssetFolders(
  organizationId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<AdminAssetFolder>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  return api.get<PageData<AdminAssetFolder>>(
    organizationPath(organizationId, `/asset-folders${query}`),
  );
}

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

export async function deleteAssetFolder(
  workspaceId: string,
  folderId: string,
): Promise<AdminAssetFolderDeleteOut> {
  return api.delete<AdminAssetFolderDeleteOut>(
    workspacePath(workspaceId, `/asset-folders/${folderId}`),
  );
}

export async function deleteAssetFolderWithMove(
  workspaceId: string,
  folderId: string,
  payload: AdminAssetFolderDeleteRequest,
): Promise<AdminAssetFolderDeleteOut> {
  return api.post<AdminAssetFolderDeleteOut>(
    workspacePath(workspaceId, `/asset-folders/${folderId}/delete`),
    {
      destinationFolderId: payload.destinationFolderId ?? null,
    },
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

export async function listOrganizationAssetTags(
  organizationId: string,
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
  return api.get<PageData<AdminAssetTag>>(organizationPath(organizationId, `/asset-tags${query}`));
}

export async function createAssetTag(
  workspaceId: string,
  payload: { name: string },
): Promise<AdminAssetTag> {
  return api.post<AdminAssetTag>(workspacePath(workspaceId, "/asset-tags"), payload);
}

export async function createOrganizationAssetTag(
  organizationId: string,
  payload: { name: string },
): Promise<AdminAssetTag> {
  return api.post<AdminAssetTag>(organizationPath(organizationId, "/asset-tags"), payload);
}

export async function getAssetDetail(
  workspaceId: string,
  assetId: string,
): Promise<AdminAssetDetail> {
  return api.get<AdminAssetDetail>(workspacePath(workspaceId, `/assets/${assetId}`));
}

export async function getOrganizationAssetDetail(
  organizationId: string,
  assetId: string,
): Promise<AdminAssetDetail> {
  return api.get<AdminAssetDetail>(organizationPath(organizationId, `/assets/${assetId}`));
}

export async function patchAsset(
  workspaceId: string,
  assetId: string,
  payload: PatchAdminAssetPayload,
): Promise<AdminAssetDetail> {
  return api.patch<AdminAssetDetail>(workspacePath(workspaceId, `/assets/${assetId}`), payload);
}

export async function deleteAsset(
  workspaceId: string,
  assetId: string,
): Promise<AdminAssetDeleteOut> {
  return api.delete<AdminAssetDeleteOut>(workspacePath(workspaceId, `/assets/${assetId}`));
}

export async function moveAsset(
  workspaceId: string,
  assetId: string,
  payload: AdminAssetMoveRequest,
): Promise<AdminAssetSummary> {
  return api.put<AdminAssetSummary>(workspacePath(workspaceId, `/assets/${assetId}/move`), payload);
}

export async function bulkMoveAssets(
  workspaceId: string,
  payload: AdminAssetsBulkMoveRequest,
): Promise<AdminAssetsBulkMoveOut> {
  return api.put<AdminAssetsBulkMoveOut>(workspacePath(workspaceId, `/assets/bulk/move`), payload);
}

export async function bulkDeleteAssets(
  workspaceId: string,
  payload: AdminAssetsBulkDeleteRequest,
): Promise<AdminAssetsBulkDeleteOut> {
  return api.post<AdminAssetsBulkDeleteOut>(
    workspacePath(workspaceId, `/assets/bulk/delete`),
    payload,
  );
}

export async function bulkUpdateAssets(
  workspaceId: string,
  payload: AdminAssetsBulkUpdateRequest,
): Promise<AdminAssetsBulkUpdateOut> {
  return api.put<AdminAssetsBulkUpdateOut>(
    workspacePath(workspaceId, `/assets/bulk/update`),
    payload,
  );
}
