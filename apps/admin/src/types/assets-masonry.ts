export type AssetMasonryItem = {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  thumbBaseUrl?: string;
  mimeType?: string;
  ext?: string;
  sizeText?: string;
  createdAtText?: string;
  aspectRatio?: number;
  createdAt?: string;
  sizeBytes?: number;
  checksumSha256?: string;
  visibility?: string;
  purpose?: string;
  indexable?: boolean;
  publicUrl?: string;
  downloadUrl?: string;
  contentUrl?: string;
  uploaderName?: string;
  uploaderAvatarUrl?: string;
  uploaderEmail?: string;
  altName?: string;

  // Future fields (reserved):
  // - category
  // - tags
  // - description
};
