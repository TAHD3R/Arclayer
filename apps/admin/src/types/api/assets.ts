export type AdminAssetSummary = {
  id: string;
  purpose: string;
  visibility: "public" | "private" | "shared" | string;
  indexable: boolean;
  ownerUserId?: string | null;
  uploaderName?: string | null;
  uploaderAvatarUrl?: string | null;
  uploaderEmail?: string | null;
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
  publicDirectUrl?: string | null;
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
  altName?: string | null;
  tags: AdminAssetTag[];
};

export type PatchAdminAssetPayload = {
  description?: string | null;
  originalFilename?: string | null;
  altName?: string | null;
  tagIds?: string[];
  visibility?: string;
  purpose?: string;
  indexable?: boolean;
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

export type AdminAssetFolderCreateRequest = {
  name: string;
  parentId?: string | null;
  description?: string | null;
  sortOrder?: number;
};

export type AdminAssetFolderUpdateRequest = {
  name?: string | null;
  parentId?: string | null;
  description?: string | null;
  sortOrder?: number;
};

export type AdminAssetFolderDeleteOut = {
  id: string;
};

export type AdminAssetFolderDeleteRequest = {
  destinationFolderId?: string | null;
};

export type AdminAssetDeleteOut = {
  id: string;
  deletedAt: string;
};

export type AdminAssetMoveRequest = {
  folderId?: string | null;
};

export type AdminAssetsBulkMoveRequest = {
  assetIds: string[];
  folderId?: string | null;
};

export type AdminAssetsBulkMoveOut = {
  movedCount: number;
  folderId?: string | null;
  movedAssetIds: string[];
};

export type AdminAssetsBulkDeleteRequest = {
  assetIds: string[];
};

export type AdminAssetsBulkDeleteOut = {
  deletedCount: number;
  deletedAssetIds: string[];
};

export type AdminAssetsBulkUpdateRequest = {
  assetIds: string[];
  visibility?: string;
  purpose?: string;
  indexable?: boolean;
};

export type AdminAssetsBulkUpdateOut = {
  updatedCount: number;
  updatedAssetIds: string[];
  visibility?: string;
  purpose?: string;
  indexable?: boolean;
};
