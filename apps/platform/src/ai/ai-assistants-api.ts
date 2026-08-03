import {
  platformCreateSystemAgent,
  platformCreateSystemAgentVersion,
  platformGetSystemAgentCapabilities,
  platformListSystemAgents,
  platformRetireSystemAgentVersion,
  platformUpdateSystemAgent,
  type AgentVersionCreateRequest,
  type AgentVersionLifecycleRequest,
  type PageDataSystemAgentDefinitionSummaryOut,
  type SystemAgentDefinitionCreateRequest,
  type SystemAgentDefinitionDetailOut,
  type SystemAgentDefinitionUpdateRequest,
  type SystemAgentCatalogCapabilitiesOut,
  type SystemAgentVersionOut,
  type PlatformListSystemAgentsData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

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
