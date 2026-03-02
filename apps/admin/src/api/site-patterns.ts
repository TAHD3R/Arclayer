import { api } from "@/lib/http";
import { toQueryString, sitePath } from "@/lib/api";
import type { PageData, SitePattern, SitePatternCreateIn, SitePatternUpdateIn } from "@/types/api";

export async function listSitePatterns(
  siteId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<SitePattern>> {
  const page = params.page ?? 1;
  const size = params.size ?? 50;
  return api.get<PageData<SitePattern>>(
    `${sitePath(siteId, "/patterns")}${toQueryString({ page, size })}`,
  );
}

export async function createSitePattern(
  siteId: string,
  payload: SitePatternCreateIn,
): Promise<SitePattern> {
  return api.post<SitePattern>(sitePath(siteId, "/patterns"), payload);
}

export async function updateSitePattern(
  siteId: string,
  patternId: string,
  payload: SitePatternUpdateIn,
): Promise<SitePattern> {
  return api.patch<SitePattern>(
    sitePath(siteId, `/patterns/${encodeURIComponent(patternId)}`),
    payload,
  );
}

export async function deleteSitePattern(siteId: string, patternId: string): Promise<void> {
  await api.delete(sitePath(siteId, `/patterns/${encodeURIComponent(patternId)}`));
}
