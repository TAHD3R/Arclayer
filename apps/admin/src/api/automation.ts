import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AdminAutomationCatalog,
  AdminAutomationFlow,
  AdminAutomationFlowList,
  AdminAutomationRun,
  AdminAutomationRunList,
  CreateAdminAutomationFlowPayload,
  PatchAdminAutomationFlowPayload,
} from "@arclayer/openapi/admin-types";

const AUTOMATION_QUERY_KEY_PREFIX = ["content", "automation"] as const;

export function buildAutomationCatalogQueryKey(projectId: string) {
  return [...AUTOMATION_QUERY_KEY_PREFIX, "catalog", projectId] as const;
}

export function buildAutomationFlowsQueryKey(projectId: string) {
  return [...AUTOMATION_QUERY_KEY_PREFIX, "flows", projectId] as const;
}

export function buildAutomationRunsQueryKey(projectId: string) {
  return [...AUTOMATION_QUERY_KEY_PREFIX, "runs", projectId] as const;
}

export async function getProjectAutomationCatalog(
  projectId: string,
): Promise<AdminAutomationCatalog> {
  return api.get<AdminAutomationCatalog>(projectPath(projectId, "/automation/catalog"));
}

export async function listProjectAutomationFlows(
  projectId: string,
): Promise<AdminAutomationFlowList> {
  return api.get<AdminAutomationFlowList>(projectPath(projectId, "/automation/flows"));
}

export async function createProjectAutomationFlow(
  projectId: string,
  payload: CreateAdminAutomationFlowPayload,
): Promise<AdminAutomationFlow> {
  return api.post<AdminAutomationFlow>(projectPath(projectId, "/automation/flows"), payload);
}

export async function updateProjectAutomationFlow(
  projectId: string,
  flowId: string,
  payload: PatchAdminAutomationFlowPayload,
): Promise<AdminAutomationFlow> {
  return api.patch<AdminAutomationFlow>(
    projectPath(projectId, `/automation/flows/${encodeURIComponent(flowId)}`),
    payload,
  );
}

export async function deleteProjectAutomationFlow(
  projectId: string,
  flowId: string,
): Promise<void> {
  await api.delete(projectPath(projectId, `/automation/flows/${encodeURIComponent(flowId)}`));
}

export async function listProjectAutomationRuns(
  projectId: string,
  params: { limit?: number } = {},
): Promise<AdminAutomationRunList> {
  const query = toQueryString({ limit: params.limit });
  return api.get<AdminAutomationRunList>(projectPath(projectId, `/automation/runs${query}`));
}

export async function getProjectAutomationRun(
  projectId: string,
  runId: string,
): Promise<AdminAutomationRun> {
  return api.get<AdminAutomationRun>(
    projectPath(projectId, `/automation/runs/${encodeURIComponent(runId)}`),
  );
}
