import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";

import type {
  ProjectDeploymentActionOut,
  ProjectDeploymentListOut,
  ProjectDeploymentOut,
  ProjectDeploymentPromoteIn,
  ProjectDeploymentRollbackIn,
} from "@arclayer/openapi";

export function buildProjectDeploymentsQueryKey(projectId: string) {
  return ["project", "deployments", projectId] as const;
}

export async function listProjectDeployments(
  projectId: string,
  params: {
    environmentId?: string | null;
    status?: string | null;
  } = {},
): Promise<ProjectDeploymentOut[]> {
  const query = toQueryString({
    environmentId: params.environmentId,
    status: params.status,
  });
  const data = await api.get<ProjectDeploymentListOut>(
    projectPath(projectId, `/deployments${query}`),
  );
  return data.items ?? [];
}

export async function promoteProjectDeployment(
  projectId: string,
  deploymentId: string,
  payload: ProjectDeploymentPromoteIn,
): Promise<ProjectDeploymentActionOut> {
  return api.post<ProjectDeploymentActionOut>(
    projectPath(projectId, `/deployments/${encodeURIComponent(deploymentId)}/promote`),
    payload,
  );
}

export async function rollbackProjectDeployment(
  projectId: string,
  deploymentId: string,
  payload: ProjectDeploymentRollbackIn,
): Promise<ProjectDeploymentActionOut> {
  return api.post<ProjectDeploymentActionOut>(
    projectPath(projectId, `/deployments/${encodeURIComponent(deploymentId)}/rollback`),
    payload,
  );
}

export async function cancelProjectDeployment(
  projectId: string,
  deploymentId: string,
): Promise<ProjectDeploymentActionOut> {
  return api.post<ProjectDeploymentActionOut>(
    projectPath(projectId, `/deployments/${encodeURIComponent(deploymentId)}/cancel`),
  );
}
