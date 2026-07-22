import { api } from "@/lib/http";
import type {
  AgentVersionCreateRequest,
  PageDataSystemAgentAssignmentOut,
  PageDataSystemAgentDefinitionSummaryOut,
  SystemAgentAssignmentCreateRequest,
  SystemAgentAssignmentOut,
  SystemAgentAssignmentUpdateRequest,
  SystemAgentCatalogCapabilitiesOut,
  SystemAgentDefinitionCreateRequest,
  SystemAgentDefinitionDetailOut,
  SystemAgentDefinitionUpdateRequest,
  SystemAgentVersionOut,
} from "@arclayer/openapi";

export const SYSTEM_AGENT_DEFINITIONS_QUERY_KEY = ["system", "agents", "definitions"] as const;
export const SYSTEM_AGENT_ASSIGNMENTS_QUERY_KEY = ["system", "agents", "assignments"] as const;
export const SYSTEM_AGENT_CAPABILITIES_QUERY_KEY = ["system", "agents", "capabilities"] as const;

type SystemAgentDefinitionListParams = {
  page?: number;
  size?: number;
  q?: string;
  lifecycleState?: "active" | "disabled" | "archived";
  scope?: "system" | "workspace";
  signal?: AbortSignal;
};

type SystemAgentAssignmentListParams = {
  page?: number;
  size?: number;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  enabled?: boolean;
  signal?: AbortSignal;
};

function buildQuery(values: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export async function listSystemAgentDefinitions(
  params: SystemAgentDefinitionListParams = {},
): Promise<PageDataSystemAgentDefinitionSummaryOut> {
  const { signal, ...query } = params;
  return api.get<PageDataSystemAgentDefinitionSummaryOut>(`/system/agents${buildQuery(query)}`, {
    signal,
  });
}

export async function getSystemAgentCapabilities(
  signal?: AbortSignal,
): Promise<SystemAgentCatalogCapabilitiesOut> {
  return api.get<SystemAgentCatalogCapabilitiesOut>("/system/agents/capabilities", { signal });
}

export async function getSystemAgentDefinition(
  definitionId: string,
  signal?: AbortSignal,
): Promise<SystemAgentDefinitionDetailOut> {
  return api.get<SystemAgentDefinitionDetailOut>(
    `/system/agents/${encodeURIComponent(definitionId)}`,
    { signal },
  );
}

export async function createSystemAgentDefinition(
  payload: SystemAgentDefinitionCreateRequest,
): Promise<SystemAgentDefinitionDetailOut> {
  return api.post<SystemAgentDefinitionDetailOut>("/system/agents", payload);
}

export async function updateSystemAgentDefinition(
  definitionId: string,
  payload: SystemAgentDefinitionUpdateRequest,
): Promise<SystemAgentDefinitionDetailOut> {
  return api.patch<SystemAgentDefinitionDetailOut>(
    `/system/agents/${encodeURIComponent(definitionId)}`,
    payload,
  );
}

export async function createSystemAgentVersion(
  definitionId: string,
  payload: AgentVersionCreateRequest,
): Promise<SystemAgentVersionOut> {
  return api.post<SystemAgentVersionOut>(
    `/system/agents/${encodeURIComponent(definitionId)}/versions`,
    payload,
  );
}

export async function retireSystemAgentVersion(
  definitionId: string,
  versionId: string,
): Promise<SystemAgentVersionOut> {
  return api.patch<SystemAgentVersionOut>(
    `/system/agents/${encodeURIComponent(definitionId)}/versions/${encodeURIComponent(versionId)}`,
    { state: "retired" },
  );
}

export async function listSystemAgentAssignments(
  params: SystemAgentAssignmentListParams = {},
): Promise<PageDataSystemAgentAssignmentOut> {
  const { signal, agentId, ...rest } = params;
  return api.get<PageDataSystemAgentAssignmentOut>(
    `/system/agent-assignments${buildQuery({ ...rest, agentId })}`,
    { signal },
  );
}

export async function createSystemAgentAssignment(
  payload: SystemAgentAssignmentCreateRequest,
): Promise<SystemAgentAssignmentOut> {
  return api.post<SystemAgentAssignmentOut>("/system/agent-assignments", payload);
}

export async function updateSystemAgentAssignment(
  assignmentId: string,
  payload: SystemAgentAssignmentUpdateRequest,
): Promise<SystemAgentAssignmentOut> {
  return api.patch<SystemAgentAssignmentOut>(
    `/system/agent-assignments/${encodeURIComponent(assignmentId)}`,
    payload,
  );
}
