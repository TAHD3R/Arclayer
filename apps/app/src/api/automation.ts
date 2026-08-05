import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AutomationCatalogOut as AdminAutomationCatalog,
  AutomationFlowOut,
  AutomationFlowListOut,
  AutomationRunOut,
  AutomationRunListOut,
  AutomationFlowCreateIn as CreateAdminAutomationFlowPayload,
  AutomationFlowPatchIn as PatchAdminAutomationFlowPayload,
} from "@arclayer/openapi";

type AdminAutomationFlow = Omit<AutomationFlowOut, "operations"> & {
  operations: NonNullable<AutomationFlowOut["operations"]>;
};
type AdminAutomationFlowList = Omit<AutomationFlowListOut, "items"> & {
  items: AdminAutomationFlow[];
};
type AdminAutomationRun = Omit<AutomationRunOut, "logs"> & {
  logs: NonNullable<AutomationRunOut["logs"]>;
};
type AdminAutomationRunList = Omit<AutomationRunListOut, "items"> & {
  items: AdminAutomationRun[];
};

function requireAutomationFlow(flow: AutomationFlowOut): AdminAutomationFlow {
  if (!Array.isArray(flow.operations)) {
    throw new Error("Invalid automation flow response");
  }
  return { ...flow, operations: flow.operations };
}

function requireAutomationRun(run: AutomationRunOut): AdminAutomationRun {
  if (!Array.isArray(run.logs)) {
    throw new Error("Invalid automation run response");
  }
  return { ...run, logs: run.logs };
}

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
  const response = await api.get<AutomationFlowListOut>(
    projectPath(projectId, "/automation/flows"),
  );
  if (!Array.isArray(response.items)) {
    throw new Error("Invalid automation flow list response");
  }
  return { ...response, items: response.items.map(requireAutomationFlow) };
}

export async function createProjectAutomationFlow(
  projectId: string,
  payload: CreateAdminAutomationFlowPayload,
): Promise<AdminAutomationFlow> {
  return requireAutomationFlow(
    await api.post<AutomationFlowOut>(projectPath(projectId, "/automation/flows"), payload),
  );
}

export async function updateProjectAutomationFlow(
  projectId: string,
  flowId: string,
  payload: PatchAdminAutomationFlowPayload,
): Promise<AdminAutomationFlow> {
  return requireAutomationFlow(
    await api.patch<AutomationFlowOut>(
      projectPath(projectId, `/automation/flows/${encodeURIComponent(flowId)}`),
      payload,
    ),
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
  const response = await api.get<AutomationRunListOut>(
    projectPath(projectId, `/automation/runs${query}`),
  );
  if (!Array.isArray(response.items)) {
    throw new Error("Invalid automation run list response");
  }
  return { ...response, items: response.items.map(requireAutomationRun) };
}

export async function getProjectAutomationRun(
  projectId: string,
  runId: string,
): Promise<AdminAutomationRun> {
  return requireAutomationRun(
    await api.get<AutomationRunOut>(
      projectPath(projectId, `/automation/runs/${encodeURIComponent(runId)}`),
    ),
  );
}
