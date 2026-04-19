import { workspacePath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AdminAutomationCatalog,
  AdminAutomationFlow,
  AdminAutomationFlowList,
  AdminAutomationRun,
  AdminAutomationRunList,
  CreateAdminAutomationFlowPayload,
  PatchAdminAutomationFlowPayload,
} from "@/types/api";

const AUTOMATION_QUERY_KEY_PREFIX = ["content", "automation"] as const;

export function buildAutomationCatalogQueryKey(workspaceId: string) {
  return [...AUTOMATION_QUERY_KEY_PREFIX, "catalog", workspaceId] as const;
}

export function buildAutomationFlowsQueryKey(workspaceId: string) {
  return [...AUTOMATION_QUERY_KEY_PREFIX, "flows", workspaceId] as const;
}

export function buildAutomationRunsQueryKey(workspaceId: string) {
  return [...AUTOMATION_QUERY_KEY_PREFIX, "runs", workspaceId] as const;
}

export async function getWorkspaceAutomationCatalog(
  workspaceId: string,
): Promise<AdminAutomationCatalog> {
  return api.get<AdminAutomationCatalog>(workspacePath(workspaceId, "/automation/catalog"));
}

export async function listWorkspaceAutomationFlows(
  workspaceId: string,
): Promise<AdminAutomationFlowList> {
  return api.get<AdminAutomationFlowList>(workspacePath(workspaceId, "/automation/flows"));
}

export async function createWorkspaceAutomationFlow(
  workspaceId: string,
  payload: CreateAdminAutomationFlowPayload,
): Promise<AdminAutomationFlow> {
  return api.post<AdminAutomationFlow>(workspacePath(workspaceId, "/automation/flows"), payload);
}

export async function updateWorkspaceAutomationFlow(
  workspaceId: string,
  flowId: string,
  payload: PatchAdminAutomationFlowPayload,
): Promise<AdminAutomationFlow> {
  return api.patch<AdminAutomationFlow>(
    workspacePath(workspaceId, `/automation/flows/${encodeURIComponent(flowId)}`),
    payload,
  );
}

export async function deleteWorkspaceAutomationFlow(
  workspaceId: string,
  flowId: string,
): Promise<void> {
  await api.delete(workspacePath(workspaceId, `/automation/flows/${encodeURIComponent(flowId)}`));
}

export async function listWorkspaceAutomationRuns(
  workspaceId: string,
  params: { limit?: number } = {},
): Promise<AdminAutomationRunList> {
  const query = toQueryString({ limit: params.limit });
  return api.get<AdminAutomationRunList>(workspacePath(workspaceId, `/automation/runs${query}`));
}

export async function getWorkspaceAutomationRun(
  workspaceId: string,
  runId: string,
): Promise<AdminAutomationRun> {
  return api.get<AdminAutomationRun>(
    workspacePath(workspaceId, `/automation/runs/${encodeURIComponent(runId)}`),
  );
}
