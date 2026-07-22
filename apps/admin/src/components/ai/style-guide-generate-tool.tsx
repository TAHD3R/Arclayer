"use client";

import { useQuery } from "@tanstack/react-query";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { AlertTriangleIcon, LoaderCircleIcon, PaletteIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  getProjectDesignSystemConceptGeneration,
  PROJECT_DESIGN_SYSTEM_QUERY_KEY,
} from "@/api/project-design-systems";
import {
  readStyleGuideGenerateArgs,
  readStyleGuideGenerationReference,
  STYLE_GUIDE_TERMINAL_STATUSES,
} from "@/components/ai/style-guide-generate-tool-contract";
import { StyleGuideGenerationStatus } from "@/components/ai/style-guide-generation-status";

function ToolNotice(props: {
  readonly variant: "danger" | "neutral";
  readonly title: string;
  readonly description: string;
}) {
  const Icon = props.variant === "danger" ? AlertTriangleIcon : PaletteIcon;
  return (
    <div
      role={props.variant === "danger" ? "alert" : "status"}
      className={
        props.variant === "danger"
          ? "flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive"
          : "flex gap-3 rounded-lg border border-border/70 bg-card p-3 text-label-primary"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-footnote font-semibold">{props.title}</p>
        <p className="mt-0.5 text-caption leading-relaxed opacity-80">{props.description}</p>
      </div>
    </div>
  );
}

function RunningNotice({ children }: { children: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border/70 bg-card p-3 text-footnote text-label-secondary"
      role="status"
    >
      <LoaderCircleIcon
        className="size-4 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

export function StyleGuideGenerateTool(props: ToolCallMessagePartProps) {
  const { t } = useTranslation(["ai", "common"]);
  const request = readStyleGuideGenerateArgs(props.args);
  const reference = readStyleGuideGenerationReference(props.result);
  const approved = props.approval?.approved;
  const generationQuery = useQuery({
    queryKey: [
      ...PROJECT_DESIGN_SYSTEM_QUERY_KEY,
      "concept-generation",
      reference?.projectId,
      reference?.designSystemId,
      reference?.generationId,
    ],
    queryFn: ({ signal }) => {
      if (reference === null) throw new Error("Style Guide generation reference is unavailable");
      return getProjectDesignSystemConceptGeneration(
        reference.projectId,
        reference.designSystemId,
        reference.generationId,
        signal,
      );
    },
    enabled: approved === true && reference !== null,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? reference?.status;
      return status && STYLE_GUIDE_TERMINAL_STATUSES.has(status) ? false : 1_250;
    },
  });

  if (props.status.type === "running") {
    return <RunningNotice>{t("ai:AI_CHAT_STYLE_GUIDE_TOOL_PREPARING")}</RunningNotice>;
  }
  if (request === null) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_INVALID_REQUEST_TITLE")}
        description={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_INVALID_REQUEST")}
      />
    );
  }
  if (props.status.type === "incomplete" || props.isError) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_FAILED_TITLE")}
        description={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_FAILED")}
      />
    );
  }
  if (props.approval?.resolution) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_APPROVAL_CLOSED_TITLE")}
        description={t(
          props.approval.resolution === "expired"
            ? "ai:AI_CHAT_STYLE_GUIDE_TOOL_APPROVAL_EXPIRED"
            : "ai:AI_CHAT_STYLE_GUIDE_TOOL_APPROVAL_CANCELLED",
        )}
      />
    );
  }
  if (props.approval && approved === undefined) {
    return (
      <section
        aria-label={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_APPROVAL_TITLE")}
        className="rounded-xl border border-border/70 bg-card p-4 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-label-primary">
            <PaletteIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption font-medium text-label-secondary">
              {t("ai:AI_CHAT_STYLE_GUIDE_TOOL_APPROVAL_LABEL")}
            </p>
            <h3 className="mt-0.5 text-callout font-semibold leading-snug text-label-primary">
              {t("ai:AI_AGENT_APPROVAL_STYLE_GUIDE_GENERATE_SUMMARY", {
                candidateCount: request.candidateCount,
                objective: request.objective,
              })}
            </h3>
            <dl className="mt-3 grid gap-2 text-caption sm:grid-cols-[auto_1fr]">
              <dt className="text-label-tertiary">{t("ai:AI_CHAT_STYLE_GUIDE_TOOL_OBJECTIVE")}</dt>
              <dd className="text-label-primary">{request.objective}</dd>
              <dt className="text-label-tertiary">{t("ai:AI_CHAT_STYLE_GUIDE_TOOL_OUTPUT")}</dt>
              <dd className="text-label-primary">
                {t("ai:AI_CHAT_STYLE_GUIDE_TOOL_CANDIDATE_COUNT", {
                  count: request.candidateCount,
                })}
              </dd>
            </dl>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              props.respondToApproval({
                approved: false,
                reason: t("ai:AI_AGENT_APPROVAL_REASON_STYLE_GUIDE_REJECTED"),
              })
            }
          >
            {t("ai:AI_AGENT_APPROVAL_REJECT_ONCE")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => props.respondToApproval({ approved: true })}
          >
            {t("ai:AI_AGENT_APPROVAL_ALLOW_ONCE")}
          </Button>
        </div>
      </section>
    );
  }
  if (approved === false) {
    return (
      <ToolNotice
        variant="neutral"
        title={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_REJECTED_TITLE")}
        description={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_REJECTED")}
      />
    );
  }
  if (approved !== true) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_PROTOCOL_ERROR_TITLE")}
        description={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_PROTOCOL_ERROR")}
      />
    );
  }
  if (props.result === undefined) {
    return <RunningNotice>{t("ai:AI_CHAT_STYLE_GUIDE_TOOL_STARTING")}</RunningNotice>;
  }
  if (reference === null) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_INVALID_RESULT_TITLE")}
        description={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_INVALID_RESULT")}
      />
    );
  }
  if (generationQuery.isError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-footnote font-semibold text-destructive">
          {t("ai:AI_CHAT_STYLE_GUIDE_TOOL_STATUS_ERROR_TITLE")}
        </p>
        <p className="mt-0.5 text-caption text-destructive/80">
          {t("ai:AI_CHAT_STYLE_GUIDE_TOOL_STATUS_ERROR")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void generationQuery.refetch()}
        >
          {t("common:RETRY")}
        </Button>
      </div>
    );
  }
  if (generationQuery.data) {
    return <StyleGuideGenerationStatus generation={generationQuery.data} />;
  }
  return <RunningNotice>{t("ai:AI_CHAT_STYLE_GUIDE_TOOL_LOADING")}</RunningNotice>;
}
