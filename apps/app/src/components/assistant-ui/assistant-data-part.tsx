"use client";

import type { ThreadAssistantMessagePart } from "@assistant-ui/react";
import { useTranslation } from "react-i18next";

import { AgentPlan } from "@/components/assistant-ui/elements/agent-plan";
import { AgentStatus, type AgentState } from "@/components/assistant-ui/elements/agent-status";
import { ErrorState } from "@/components/assistant-ui/elements/error-state";
import { RecommendationCard } from "@/components/assistant-ui/elements/recommendation-card";
import { SubagentList, type SubagentItem } from "@/components/assistant-ui/elements/subagent-list";

type DataPart = Extract<ThreadAssistantMessagePart, { type: "data" }>;

const readObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readStrings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;

const readSubagents = (value: unknown): SubagentItem[] | null => {
  if (!Array.isArray(value)) return null;
  const agents = value.map(readObject);
  if (
    agents.some(
      (agent) =>
        agent === null || typeof agent.name !== "string" || typeof agent.model !== "string",
    )
  ) {
    return null;
  }
  return agents.map((agent) => ({ name: agent!.name as string, model: agent!.model as string }));
};

export function AssistantDataPart({ part }: { part: DataPart }) {
  const { t } = useTranslation(["ai"]);
  const data = readObject(part.data);

  if (part.name === "agent-plan" && data) {
    const steps = readStrings(data.steps);
    if (steps && typeof data.activeIndex === "number") {
      return <AgentPlan steps={steps} activeIndex={data.activeIndex} />;
    }
  }

  if (part.name === "subagent-list" && data) {
    const agents = readSubagents(data.agents);
    const progress = Array.isArray(data.progress)
      ? data.progress.filter((value): value is number => typeof value === "number")
      : null;
    const summaryAgent = readObject(data.summaryAgent);
    if (
      agents &&
      progress &&
      typeof data.completedCount === "number" &&
      typeof data.showSummary === "boolean" &&
      summaryAgent &&
      typeof summaryAgent.name === "string" &&
      typeof summaryAgent.model === "string"
    ) {
      return (
        <SubagentList
          agents={agents}
          completedCount={data.completedCount}
          progress={progress}
          showSummary={data.showSummary}
          summaryAgent={{ name: summaryAgent.name, model: summaryAgent.model }}
        />
      );
    }
  }

  if (part.name === "agent-status" && data) {
    if (
      (data.state === "working" || data.state === "waiting" || data.state === "done") &&
      typeof data.label === "string"
    ) {
      return (
        <AgentStatus
          state={data.state as AgentState}
          label={data.label}
          elapsed={typeof data.elapsed === "string" ? data.elapsed : undefined}
        />
      );
    }
  }

  if (part.name === "recommendation" && data) {
    if (
      (data.state === "idle" || data.state === "accepted") &&
      typeof data.question === "string" &&
      typeof data.body === "string" &&
      typeof data.confidenceLabel === "string" &&
      typeof data.acceptedLabel === "string"
    ) {
      return (
        <RecommendationCard
          state={data.state}
          question={data.question}
          confidenceLabel={data.confidenceLabel}
          acceptedLabel={data.acceptedLabel}
        >
          {data.body}
        </RecommendationCard>
      );
    }
  }

  return (
    <ErrorState
      title={t("ai:AI_CHAT_DATA_PART_INVALID_TITLE")}
      detail={t("ai:AI_CHAT_DATA_PART_INVALID_DETAIL")}
      retrying={false}
    />
  );
}
