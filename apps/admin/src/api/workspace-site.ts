import { workspacePath } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AdminSitePreviewToken,
  AdminWorkspaceSite,
  CreateAdminSitePreviewTokenPayload,
} from "@/types/api";

export async function getWorkspaceSite(workspaceId: string): Promise<AdminWorkspaceSite> {
  return api.get<AdminWorkspaceSite>(workspacePath(workspaceId, "/site"));
}

export async function issueWorkspaceSitePreviewToken(
  workspaceId: string,
  payload: CreateAdminSitePreviewTokenPayload = {},
): Promise<AdminSitePreviewToken> {
  return api.post<AdminSitePreviewToken>(
    workspacePath(workspaceId, "/site/preview-tokens"),
    payload,
  );
}
