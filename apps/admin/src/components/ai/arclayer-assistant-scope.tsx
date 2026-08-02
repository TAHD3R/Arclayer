import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ArclayerAssistantProvider } from "@/components/ai/arclayer-assistant-provider";
import { listAIWorkspaceAgents, type AIWorkspaceAgentExecutionMode } from "@/api/ai";
import { i18n } from "@/lib/i18n";
import {
  DEFAULT_AI_AGENT_ID,
  DEFAULT_AI_COMPOSER_MODE,
  useAiChatStore,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export interface ArclayerAssistantScopeProps {
  readonly children: (state: ArclayerAssistantState) => ReactNode;
}

export type ArclayerAssistantState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "unavailable"; retry?: () => void }>
  | Readonly<{
      status: "ready";
      leadAgent: {
        name: string;
        description: string;
        supportedExecutionModes: readonly AIWorkspaceAgentExecutionMode[];
      };
    }>;

function localizeAgentRuntime(key: string, params?: Readonly<Record<string, unknown>>): string {
  return String(i18n.t(key, params as never));
}

export function ArclayerAssistantScope({ children }: ArclayerAssistantScopeProps) {
  const { t } = useTranslation(["ai"]);
  const composerMode = useAiChatStore((state) => state.composerMode || DEFAULT_AI_COMPOSER_MODE);
  const selectedAgentId = useAiChatStore((state) => state.selectedAgentId ?? DEFAULT_AI_AGENT_ID);
  const setSelectedAgentId = useAiChatStore((state) => state.setSelectedAgentId);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
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
  const catalogData = catalog.isError ? undefined : catalog.data;
  const selectedAgent = catalogData?.agents.find(
    (agent) => agent.available && agent.agentId === selectedAgentId,
  );
  const defaultAgent = catalogData?.agents.find(
    (agent) => agent.available && agent.agentId === catalogData.defaultAgentId,
  );
  const leadAgent =
    selectedAgent?.supportedExecutionModes.includes(composerMode) === true
      ? selectedAgent
      : defaultAgent?.supportedExecutionModes.includes(composerMode) === true
        ? defaultAgent
        : undefined;

  useEffect(() => {
    if (leadAgent && selectedAgentId !== leadAgent.agentId) {
      setSelectedAgentId(leadAgent.agentId);
    }
  }, [leadAgent, selectedAgentId, setSelectedAgentId]);

  if (!workspaceId) return children({ status: "unavailable" });
  if (catalog.isPending) return children({ status: "loading" });
  if (!leadAgent) {
    return children({
      status: "unavailable",
      retry: () => {
        void catalog.refetch();
      },
    });
  }

  const leadAgentState = {
    name: leadAgent.nameI18nKey ? t(`ai:${leadAgent.nameI18nKey}`) : leadAgent.name,
    description: leadAgent.descriptionI18nKey
      ? t(`ai:${leadAgent.descriptionI18nKey}`)
      : leadAgent.description,
    supportedExecutionModes: leadAgent.supportedExecutionModes,
  };

  return (
    <ArclayerAssistantProvider
      workspaceId={workspaceId}
      projectId={projectId}
      leadAgentId={leadAgent.agentId}
      executionMode={composerMode}
      localize={localizeAgentRuntime}
      initialTitle={t("ai:AI_CHAT_NEW_CONVERSATION")}
    >
      {children({ status: "ready", leadAgent: leadAgentState })}
    </ArclayerAssistantProvider>
  );
}
