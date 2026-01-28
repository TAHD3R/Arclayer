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

export type ListAdminAssetsParams = {
  page?: number;
  size?: number;
  q?: string;
  purpose?: string;
  visibility?: string;
  indexable?: boolean;
  folderId?: string | null;
  mimePrefix?: string;
  ordering?: string;
};

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) continue;
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
    mimePrefix: params.mimePrefix,
    ordering: params.ordering,
  });
  return api.get<PageData<AdminAssetSummary>>(`/admin/assets${query}`);
}

export async function listAdminAssetFolders(): Promise<AdminAssetFolder[]> {
  return api.get<AdminAssetFolder[]>(`/admin/asset-folders`);
}
