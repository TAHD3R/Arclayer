import { projectPath } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AdminSitePreviewToken,
  AdminWorkspaceSite,
  CreateAdminSitePreviewTokenPayload,
} from "@arclayer/openapi/admin-types";

export async function getProjectSite(projectId: string): Promise<AdminWorkspaceSite> {
  return api.get<AdminWorkspaceSite>(projectPath(projectId, "/site"));
}

export async function issueProjectSitePreviewToken(
  projectId: string,
  payload: CreateAdminSitePreviewTokenPayload = {},
): Promise<AdminSitePreviewToken> {
  return api.post<AdminSitePreviewToken>(projectPath(projectId, "/site/preview-tokens"), payload);
}
