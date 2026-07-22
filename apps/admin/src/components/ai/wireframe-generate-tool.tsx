"use client";

import { useQuery } from "@tanstack/react-query";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { AlertTriangleIcon, LayoutTemplateIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { getProjectBuilderGeneration } from "@/api/project-builder";
import {
  readWireframeGenerateArgs,
  readWireframeGenerationReference,
  WIREFRAME_TERMINAL_STATUSES,
} from "@/components/ai/wireframe-generate-tool-contract";
import { WireframeGenerationStatus } from "@/components/ai/wireframe-generation-status";

function ToolNotice(props: {
  readonly variant: "danger" | "neutral";
  readonly title: string;
  readonly description: string;
}) {
  const Icon = props.variant === "danger" ? AlertTriangleIcon : LayoutTemplateIcon;
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

export function WireframeGenerateTool(props: ToolCallMessagePartProps) {
  const { t } = useTranslation(["ai", "common"]);
  const request = readWireframeGenerateArgs(props.args);
  const reference = readWireframeGenerationReference(props.result);
  const matchingReference =
    request && reference?.selectedPageId === request.pageItemId ? reference : null;
  const approved = props.approval?.approved;
  const generationQuery = useQuery({
    queryKey: [
      "project",
      "builder",
      matchingReference?.projectId,
      "generation",
      matchingReference?.generationId,
    ],
    queryFn: ({ signal }) => {
      if (matchingReference === null) {
        throw new Error("Wireframe generation reference is unavailable");
      }
      return getProjectBuilderGeneration(
        matchingReference.projectId,
        matchingReference.generationId,
        signal,
      );
    },
    enabled: approved === true && matchingReference !== null,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? matchingReference?.status;
      return status && WIREFRAME_TERMINAL_STATUSES.has(status) ? false : 1_250;
    },
  });

  if (props.status.type === "running") {
    return <RunningNotice>{t("ai:AI_CHAT_WIREFRAME_TOOL_PREPARING")}</RunningNotice>;
  }
  if (request === null) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_WIREFRAME_TOOL_INVALID_REQUEST_TITLE")}
        description={t("ai:AI_CHAT_WIREFRAME_TOOL_INVALID_REQUEST")}
      />
    );
  }
  if (props.status.type === "incomplete" || props.isError) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_WIREFRAME_TOOL_FAILED_TITLE")}
        description={t("ai:AI_CHAT_WIREFRAME_TOOL_FAILED")}
      />
    );
  }
  if (props.approval?.resolution) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_WIREFRAME_TOOL_APPROVAL_CLOSED_TITLE")}
        description={t(
          props.approval.resolution === "expired"
            ? "ai:AI_CHAT_WIREFRAME_TOOL_APPROVAL_EXPIRED"
            : "ai:AI_CHAT_WIREFRAME_TOOL_APPROVAL_CANCELLED",
        )}
      />
    );
  }
  if (props.approval && approved === undefined) {
    return (
      <section
        aria-label={t("ai:AI_CHAT_WIREFRAME_TOOL_APPROVAL_TITLE")}
        className="rounded-xl border border-border/70 bg-card p-4 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-label-primary">
            <LayoutTemplateIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption font-medium text-label-secondary">
              {t("ai:AI_CHAT_WIREFRAME_TOOL_APPROVAL_LABEL")}
            </p>
            <h3 className="mt-0.5 text-callout font-semibold leading-snug text-label-primary">
              {t("ai:AI_AGENT_APPROVAL_WIREFRAME_GENERATE_SUMMARY", {
                candidateCount: request.candidateCount,
              })}
            </h3>
            <dl className="mt-3 grid gap-2 text-caption sm:grid-cols-[auto_1fr]">
              <dt className="text-label-tertiary">{t("ai:AI_CHAT_WIREFRAME_TOOL_PAGE")}</dt>
              <dd className="break-all font-mono text-label-primary">{request.pageItemId}</dd>
              <dt className="text-label-tertiary">{t("ai:AI_CHAT_WIREFRAME_TOOL_OBJECTIVE")}</dt>
              <dd className="text-label-primary">{request.objective}</dd>
              <dt className="text-label-tertiary">{t("ai:AI_CHAT_WIREFRAME_TOOL_OUTPUT")}</dt>
              <dd className="text-label-primary">
                {t("ai:AI_CHAT_WIREFRAME_TOOL_CANDIDATE_COUNT", {
                  count: request.candidateCount,
                })}
              </dd>
            </dl>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                props.respondToApproval({
                  approved: false,
                  reason: t("ai:AI_AGENT_APPROVAL_REASON_WIREFRAME_REJECTED"),
                })
              }
            >
              {t("ai:AI_AGENT_APPROVAL_WIREFRAME_REJECT_ONCE")}
            </Button>
            <p className="mt-1.5 text-caption leading-relaxed text-label-tertiary">
              {t("ai:AI_AGENT_APPROVAL_WIREFRAME_REJECT_ONCE_DESC")}
            </p>
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={() => props.respondToApproval({ approved: true })}
            >
              {t("ai:AI_AGENT_APPROVAL_WIREFRAME_ALLOW_ONCE")}
            </Button>
            <p className="mt-1.5 text-caption leading-relaxed text-label-tertiary">
              {t("ai:AI_AGENT_APPROVAL_WIREFRAME_ALLOW_ONCE_DESC")}
            </p>
          </div>
        </div>
      </section>
    );
  }
  if (approved === false) {
    return (
      <ToolNotice
        variant="neutral"
        title={t("ai:AI_CHAT_WIREFRAME_TOOL_REJECTED_TITLE")}
        description={t("ai:AI_CHAT_WIREFRAME_TOOL_REJECTED")}
      />
    );
  }
  if (approved !== true) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_WIREFRAME_TOOL_PROTOCOL_ERROR_TITLE")}
        description={t("ai:AI_CHAT_WIREFRAME_TOOL_PROTOCOL_ERROR")}
      />
    );
  }
  if (props.result === undefined) {
    return <RunningNotice>{t("ai:AI_CHAT_WIREFRAME_TOOL_STARTING")}</RunningNotice>;
  }
  if (matchingReference === null) {
    return (
      <ToolNotice
        variant="danger"
        title={t("ai:AI_CHAT_WIREFRAME_TOOL_INVALID_RESULT_TITLE")}
        description={t("ai:AI_CHAT_WIREFRAME_TOOL_INVALID_RESULT")}
      />
    );
  }
  if (generationQuery.isError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-footnote font-semibold text-destructive">
          {t("ai:AI_CHAT_WIREFRAME_TOOL_STATUS_ERROR_TITLE")}
        </p>
        <p className="mt-0.5 text-caption text-destructive/80">
          {t("ai:AI_CHAT_WIREFRAME_TOOL_STATUS_ERROR")}
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
    if (generationQuery.data.targetStage !== "wireframe") {
      return (
        <ToolNotice
          variant="danger"
          title={t("ai:AI_CHAT_WIREFRAME_TOOL_INVALID_RESULT_TITLE")}
          description={t("ai:AI_CHAT_WIREFRAME_TOOL_INVALID_RESULT")}
        />
      );
    }
    return (
      <WireframeGenerationStatus
        generation={generationQuery.data}
        projectId={matchingReference.projectId}
        selectedPageId={matchingReference.selectedPageId}
      />
    );
  }
  return <RunningNotice>{t("ai:AI_CHAT_WIREFRAME_TOOL_LOADING")}</RunningNotice>;
}
