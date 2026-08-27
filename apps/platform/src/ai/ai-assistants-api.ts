import {
  platformCreateSystemAgent,
  platformCreateSystemAgentVersion,
  platformGetSystemAgentCapabilities,
  platformListSystemAgentAssignments,
  platformListSystemAgentVersions,
  platformListSystemAgents,
  platformRetireSystemAgentVersion,
  platformUpdateSystemAgent,
  type AgentVersionCreateRequest,
  type AgentVersionLifecycleRequest,
  type PageDataSystemAgentAssignmentOut,
  type PageDataSystemAgentDefinitionSummaryOut,
  type SystemAgentDefinitionCreateRequest,
  type SystemAgentDefinitionDetailOut,
  type SystemAgentDefinitionUpdateRequest,
  type SystemAgentCatalogCapabilitiesOut,
  type SystemAgentVersionListOut,
  type SystemAgentVersionOut,
  type PlatformListSystemAgentsData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

function unwrapOrThrow<T>(result: {
  error?: unknown;
  data?: { data?: T | null; error?: string | null } | undefined;
  response?: Response;
}): T {
  if (result.error !== undefined || !result.data?.data || result.data.error) {
    throw new Error(
      (result.data?.error as string | undefined) ?? "PLATFORM_AI_ASSISTANTS_REQUEST_FAILED",
    );
  }
  return result.data.data;
}

export function listAiAssistantVersions(definitionId: string): Promise<SystemAgentVersionListOut> {
  return platformListSystemAgentVersions({
    client: platformApiClient,
    path: { definition_id: definitionId },
  }).then((result) => unwrapOrThrow<SystemAgentVersionListOut>(result));
}

export function listAiAssistantAssignments(
  agentId: string,
): Promise<PageDataSystemAgentAssignmentOut> {
  return platformListSystemAgentAssignments({
    client: platformApiClient,
    query: { agentId, page: 1, size: 25 },
  }).then((result) => unwrapOrThrow<PageDataSystemAgentAssignmentOut>(result));
}

export function listAiAssistants(
  query?: NonNullable<PlatformListSystemAgentsData["query"]>,
): Promise<PageDataSystemAgentDefinitionSummaryOut> {
  return platformListSystemAgents({ client: platformApiClient, query }).then((result) => {
    if (result.error !== undefined || !result.data?.data || result.data.error) {
      throw new Error(result.data?.error ?? "PLATFORM_AI_ASSISTANTS_REQUEST_FAILED");
    }
    return result.data.data;
  });
}

function unwrap<T>(result: {
  data?: { data?: T | null; error?: string | null };
  error?: unknown;
}): T {
  if (result.error !== undefined || !result.data?.data || result.data.error) {
    throw new Error(result.data?.error ?? "PLATFORM_AI_ASSISTANTS_REQUEST_FAILED");
  }
  return result.data.data;
}

export function updateAiAssistant(
  assistantId: string,
  body: SystemAgentDefinitionUpdateRequest,
): Promise<SystemAgentDefinitionDetailOut> {
  return platformUpdateSystemAgent({
    client: platformApiClient,
    path: { definition_id: assistantId },
    body,
  }).then(unwrap);
}

export function createAiAssistant(
  body: SystemAgentDefinitionCreateRequest,
): Promise<SystemAgentDefinitionDetailOut> {
  return platformCreateSystemAgent({
    body,
    client: platformApiClient,
  }).then(unwrap);
}

export function getAiAssistantCapabilities(): Promise<SystemAgentCatalogCapabilitiesOut> {
  return platformGetSystemAgentCapabilities({ client: platformApiClient }).then(unwrap);
}

export function createAiAssistantVersion(
  assistantId: string,
  body: AgentVersionCreateRequest,
): Promise<SystemAgentVersionOut> {
  return platformCreateSystemAgentVersion({
    body,
    client: platformApiClient,
    path: { definition_id: assistantId },
  }).then(unwrap);
}

export function retireAiAssistantVersion(
  assistantId: string,
  versionId: string,
  body: AgentVersionLifecycleRequest,
): Promise<SystemAgentVersionOut> {
  return platformRetireSystemAgentVersion({
    client: platformApiClient,
    path: { definition_id: assistantId, version_id: versionId },
    body,
  }).then(unwrap);
}
