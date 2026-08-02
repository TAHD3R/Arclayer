import { api } from "@/lib/http";
import { projectPath, toQueryString } from "@/lib/api";
import type {
  AdminAssetSummaryOut as AdminAssetSummary,
  AdminAssetFolderOut as AdminAssetFolder,
  AdminAssetTagOut as AdminAssetTag,
  AdminAssetDetailOut as AdminAssetDetail,
  AdminAssetUpdateRequest as PatchAdminAssetPayload,
  DomainProjectsListAssetsData,
  AdminAssetFolderCreateRequest,
  AdminAssetFolderDeleteRequest,
  AdminAssetFolderUpdateRequest,
  AdminAssetFolderDeleteOut,
  AdminAssetDeleteOut,
  AdminAssetMoveRequest,
  AdminAssetBulkMoveRequest as AdminAssetsBulkMoveRequest,
  AdminAssetBulkMoveOut as AdminAssetsBulkMoveOut,
  AdminAssetBulkDeleteRequest as AdminAssetsBulkDeleteRequest,
  AdminAssetBulkDeleteOut as AdminAssetsBulkDeleteOut,
  AdminAssetBulkUpdateRequest as AdminAssetsBulkUpdateRequest,
  AdminAssetBulkUpdateOut as AdminAssetsBulkUpdateOut,
  AssetPurpose,
  AssetVisibility,
  PageDataAdminAssetSummaryOut,
  PageDataAdminAssetFolderOut,
  PageDataAdminAssetTagOut,
} from "@arclayer/openapi";

type ListAdminAssetsParams = NonNullable<DomainProjectsListAssetsData["query"]>;

type AssetSummaryPage = Omit<PageDataAdminAssetSummaryOut, "items"> & {
  items: NonNullable<PageDataAdminAssetSummaryOut["items"]>;
};
type AssetFolderPage = Omit<PageDataAdminAssetFolderOut, "items"> & {
  items: NonNullable<PageDataAdminAssetFolderOut["items"]>;
};
type AssetTagPage = Omit<PageDataAdminAssetTagOut, "items"> & {
  items: NonNullable<PageDataAdminAssetTagOut["items"]>;
};
type AssetBulkDeleteResult = Omit<AdminAssetsBulkDeleteOut, "deletedAssetIds"> & {
  deletedAssetIds: string[];
};
type AssetBulkUpdateResult = Omit<
  AdminAssetsBulkUpdateOut,
  "indexable" | "purpose" | "updatedAssetIds" | "visibility"
> & {
  indexable?: boolean;
  purpose?: AssetPurpose;
  updatedAssetIds: string[];
  visibility?: AssetVisibility;
};

function hasRequiredAssetPageMetadata(page: {
  items?: unknown[];
  page?: number;
  pages?: number;
  size?: number;
  total?: number;
}): boolean {
  return (
    Array.isArray(page.items) &&
    typeof page.page === "number" &&
    typeof page.pages === "number" &&
    typeof page.size === "number" &&
    typeof page.total === "number"
  );
}

function requireAssetSummaryPage(page: PageDataAdminAssetSummaryOut): AssetSummaryPage {
  if (!hasRequiredAssetPageMetadata(page) || !page.items) {
    throw new Error("Invalid asset pagination response");
  }
  return { ...page, items: page.items };
}

function requireAssetFolderPage(page: PageDataAdminAssetFolderOut): AssetFolderPage {
  if (!hasRequiredAssetPageMetadata(page) || !page.items) {
    throw new Error("Invalid asset pagination response");
  }
  return { ...page, items: page.items };
}

function requireAssetTagPage(page: PageDataAdminAssetTagOut): AssetTagPage {
  if (!hasRequiredAssetPageMetadata(page) || !page.items) {
    throw new Error("Invalid asset pagination response");
  }
  return { ...page, items: page.items };
}

function requireAssetBulkDeleteResult(out: AdminAssetsBulkDeleteOut): AssetBulkDeleteResult {
  if (!Array.isArray(out.deletedAssetIds)) {
    throw new Error("Invalid bulk asset delete response");
  }
  return { ...out, deletedAssetIds: out.deletedAssetIds };
}

function requireAssetBulkUpdateResult(out: AdminAssetsBulkUpdateOut): AssetBulkUpdateResult {
  if (
    !Array.isArray(out.updatedAssetIds) ||
    out.indexable === null ||
    out.purpose === null ||
    out.visibility === null
  ) {
    throw new Error("Invalid bulk asset update response");
  }
  return {
    ...out,
    indexable: out.indexable,
    purpose: out.purpose,
    updatedAssetIds: out.updatedAssetIds,
    visibility: out.visibility,
  };
}

export async function listAssets(
  projectId: string,
  params: ListAdminAssetsParams = {},
): Promise<AssetSummaryPage> {
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
    ordering: params.ordering,
  });
  const page = await api.get<PageDataAdminAssetSummaryOut>(
    projectPath(projectId, `/assets${query}`),
  );
  return requireAssetSummaryPage(page);
}

export async function listAssetFolders(
  projectId: string,
  params: { page?: number; size?: number } = {},
): Promise<AssetFolderPage> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  const page = await api.get<PageDataAdminAssetFolderOut>(
    projectPath(projectId, `/asset-folders${query}`),
  );
  return requireAssetFolderPage(page);
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
): Promise<AssetTagPage> {
  const query = toQueryString({
    q: params.q,
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  const page = await api.get<PageDataAdminAssetTagOut>(
    projectPath(projectId, `/asset-tags${query}`),
  );
  return requireAssetTagPage(page);
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
): Promise<AssetBulkDeleteResult> {
  return requireAssetBulkDeleteResult(
    await api.post<AdminAssetsBulkDeleteOut>(
      projectPath(projectId, `/assets/bulk/delete`),
      payload,
    ),
  );
}

export async function bulkUpdateAssets(
  projectId: string,
  payload: AdminAssetsBulkUpdateRequest,
): Promise<AssetBulkUpdateResult> {
  return requireAssetBulkUpdateResult(
    await api.put<AdminAssetsBulkUpdateOut>(projectPath(projectId, `/assets/bulk/update`), payload),
  );
}
