import { projectPath } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AdminRelease,
  AdminReleaseDryRun,
  AdminReleaseList,
  AdminReleasePublishResult,
  AdminReleaseRollbackResult,
} from "@arclayer/openapi/admin-types";
import type { ReleasePublishIn } from "@arclayer/openapi";

export function buildProjectReleasesQueryKey(projectId: string) {
  return ["project", "releases", projectId] as const;
}

export async function listProjectReleases(projectId: string): Promise<AdminRelease[]> {
  const data = await api.get<AdminReleaseList>(projectPath(projectId, "/releases"));
  return data.items ?? [];
}

export async function getProjectReleaseDryRun(projectId: string): Promise<AdminReleaseDryRun> {
  return api.get<AdminReleaseDryRun>(projectPath(projectId, "/releases/dry-run"));
}

export async function publishProjectRelease(
  projectId: string,
  payload?: ReleasePublishIn,
): Promise<AdminReleasePublishResult> {
  return api.post<AdminReleasePublishResult>(projectPath(projectId, "/releases/publish"), payload);
}

export async function rollbackProjectRelease(
  projectId: string,
  releaseId: string,
): Promise<AdminReleaseRollbackResult> {
  return api.post<AdminReleaseRollbackResult>(
    projectPath(projectId, `/releases/${encodeURIComponent(releaseId)}/rollback`),
  );
}
