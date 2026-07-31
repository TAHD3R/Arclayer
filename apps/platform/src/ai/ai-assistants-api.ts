import {
  platformListSystemAgents,
  type PageDataSystemAgentDefinitionSummaryOut,
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
