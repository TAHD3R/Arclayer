import { api } from "@/lib/http";
import type { SitePreviewTokenOut, SiteRuntimeOut, WorkspaceSiteOut } from "@/types/api";

export async function getWorkspaceSite(workspaceId: string): Promise<WorkspaceSiteOut> {
  return api.get<WorkspaceSiteOut>(`/workspaces/${workspaceId}/site`);
}

export async function createWorkspacePreviewToken(
  workspaceId: string,
  payload: { ttlSeconds?: number } = {},
): Promise<SitePreviewTokenOut> {
  return api.post<SitePreviewTokenOut>(`/workspaces/${workspaceId}/site/preview-tokens`, {
    ttlSeconds: payload.ttlSeconds ?? 600,
  });
}

export async function getSiteRuntimePreview(
  siteId: string,
  token: string,
): Promise<SiteRuntimeOut> {
  const qs = new URLSearchParams({ mode: "preview", token });
  return api.get<SiteRuntimeOut>(`/sites/${siteId}/runtime?${qs.toString()}`);
}
