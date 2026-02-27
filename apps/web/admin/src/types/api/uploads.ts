export type UploadInitRequest = {
  purpose: string;
  filename: string;
  mime?: string | null;
  sizeBytes: number;
  expectedSha256?: string | null;
  visibility?: string | null;
  indexable?: boolean | null;
  folderId?: string | null;
};

export type UploadInitOut = {
  uploadId: string;
  chunkSize: number;
  totalParts: number;
  expiresAt: string;
  /** local | s3_multipart */
  method?: string | null;
  reservedAssetId?: string | null;
  objectKey?: string | null;
};

export type UploadStatusOut = {
  uploadId: string;
  status: string;
  missingParts: number[];
  uploadedParts: number;
  totalParts: number;
};

export type UploadCompleteOut = {
  assetId: string;
};

export type UploadAbortOut = {
  uploadId: string;
  status: string;
};

export type UploadPartPresignOut = {
  url: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export type UploadPartCommitRequest = {
  etag: string;
  sizeBytes: number;
};
