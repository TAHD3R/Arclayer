import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ArclayerAssistantProvider } from "@/components/ai/arclayer-assistant-provider";
import { listAIWorkspaceAgents } from "@/api/ai";
import { i18n } from "@/lib/i18n";
import {
  DEFAULT_AI_AGENT_ID,
  DEFAULT_AI_COMPOSER_MODE,
  useAiChatStore,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export interface ArclayerAssistantScopeProps {
  readonly children: (assistantAvailable: boolean) => ReactNode;
}

function localizeAgentRuntime(key: string, params?: Readonly<Record<string, unknown>>): string {
  return String(i18n.t(key, params as never));
}

export function ArclayerAssistantScope({ children }: ArclayerAssistantScopeProps) {
  const { t } = useTranslation(["ai"]);
  const composerMode = useAiChatStore((state) => state.composerMode || DEFAULT_AI_COMPOSER_MODE);
  const selectedAgentId = useAiChatStore((state) => state.selectedAgentId ?? DEFAULT_AI_AGENT_ID);
  const setSelectedAgentId = useAiChatStore((state) => state.setSelectedAgentId);
  const workspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId ?? state.lastWorkspaceId,
  );
  const projectId = useWorkspaceStore((state) => state.currentProjectId);
  const catalog = useQuery({
    queryKey: ["ai", "workspace-agents", workspaceId, projectId],
    queryFn: ({ signal }) =>
      listAIWorkspaceAgents({
        workspaceId: workspaceId ?? "",
        projectId,
        signal,
      }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  });
  const leadAgent = catalog.data?.agents.find(
    (agent) => agent.available && agent.agentId === selectedAgentId,
  );
  const defaultAgent = catalog.data?.agents.find(
    (agent) => agent.available && agent.agentId === catalog.data?.defaultAgentId,
  );

  useEffect(() => {
    if (selectedAgentId === null && defaultAgent) {
      setSelectedAgentId(defaultAgent.agentId);
    }
  }, [defaultAgent, selectedAgentId, setSelectedAgentId]);

  if (!workspaceId) return children(false);
  if (!leadAgent || !leadAgent.supportedExecutionModes.includes(composerMode)) {
    return children(false);
  }

  return (
    <ArclayerAssistantProvider
      workspaceId={workspaceId}
      projectId={projectId}
      leadAgentId={leadAgent.agentId}
      executionMode={composerMode}
      localize={localizeAgentRuntime}
      initialTitle={t("ai:AI_CHAT_NEW_CONVERSATION")}
    >
      {children(true)}
    </ArclayerAssistantProvider>
  );
}
