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

export type SitePattern = {
  id: string;
  siteId: string;
  code: string;
  label: Record<string, string>;
  category: string;
  previewImageUrl?: string | null;
  blocks: Array<Record<string, unknown>>;
  createdAtMs: number;
};

export type SitePatternCreateIn = {
  code: string;
  label: Record<string, string>;
  category?: string;
  previewImageUrl?: string | null;
  blocks: Array<Record<string, unknown>>;
};

// Backend `SitePatternUpdateIn` does NOT accept `code` (extra="forbid").
export type SitePatternUpdateIn = Partial<Omit<SitePatternCreateIn, "code">>;

export async function listSitePatterns(
  siteId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<SitePattern>> {
  const page = params.page ?? 1;
  const size = params.size ?? 50;
  return api.get<PageData<SitePattern>>(
    `/sites/${encodeURIComponent(siteId)}/patterns?page=${page}&size=${size}`,
  );
}

export async function createSitePattern(
  siteId: string,
  payload: SitePatternCreateIn,
): Promise<SitePattern> {
  return api.post<SitePattern>(`/sites/${encodeURIComponent(siteId)}/patterns`, payload);
}

export async function updateSitePattern(
  siteId: string,
  patternId: string,
  payload: SitePatternUpdateIn,
): Promise<SitePattern> {
  return api.patch<SitePattern>(
    `/sites/${encodeURIComponent(siteId)}/patterns/${encodeURIComponent(patternId)}`,
    payload,
  );
}

export async function deleteSitePattern(siteId: string, patternId: string): Promise<void> {
  await api.delete(
    `/sites/${encodeURIComponent(siteId)}/patterns/${encodeURIComponent(patternId)}`,
  );
}
