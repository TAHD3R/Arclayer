import type { BuilderGenerationOut } from "@arclayer/openapi";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleX,
  LoaderCircle,
  SwatchBook,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@arclayer/ui/badge";
import { buttonVariants } from "@arclayer/ui/button";
import { Progress } from "@arclayer/ui/progress";
import { DESIGN_TERMINAL_STATUSES } from "@/components/ai/design-generate-tool-contract";
import { buildProjectEditorHref } from "@/pages/projects/editor/editor-deep-link";

export function DesignGenerationStatus({
  generation,
  projectId,
  selectedPageId,
}: Readonly<{
  generation: BuilderGenerationOut;
  projectId: string;
  selectedPageId: string;
}>) {
  const { t } = useTranslation(["ai", "errors"]);
  const terminal = DESIGN_TERMINAL_STATUSES.has(generation.status);
  const failed = generation.status === "failed";
  const cancelled = generation.status === "cancelled";
  const partial = generation.status === "partial";
  const complete = generation.status === "succeeded" || partial;
  const progress =
    generation.progressTotal && generation.progressTotal > 0
      ? Math.min(100, (generation.progressCompleted / generation.progressTotal) * 100)
      : null;
  const StatusIcon =
    failed || cancelled
      ? CircleX
      : partial
        ? AlertTriangle
        : complete
          ? CheckCircle2
          : LoaderCircle;

  return (
    <section
      aria-label={t("ai:AI_CHAT_DESIGN_TOOL_TITLE")}
      aria-live="polite"
      aria-busy={!terminal}
      className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm"
    >
      <div className="flex items-start gap-3 border-b border-border/60 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-label-primary">
          <StatusIcon
            className={terminal ? "size-4" : "size-4 animate-spin motion-reduce:animate-none"}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-footnote font-semibold text-label-primary">
              {t(`ai:AI_CHAT_DESIGN_TOOL_STATUS_${generation.status.toUpperCase()}`)}
            </h3>
            <Badge variant={failed ? "destructive" : complete ? "default" : "outline"}>
              {t("ai:AI_CHAT_DESIGN_TOOL_CANDIDATE_COUNT", {
                count: generation.candidates.length,
              })}
            </Badge>
          </div>
          <p className="mt-0.5 text-caption leading-relaxed text-label-secondary">
            {t("ai:AI_CHAT_DESIGN_TOOL_SERVER_OWNED_STATUS")}
          </p>
        </div>
      </div>

      {!terminal && progress !== null ? (
        <div className="space-y-2 border-b border-border/60 px-4 py-3">
          <Progress value={progress} />
          <p className="text-caption text-label-secondary">
            {t("ai:AI_CHAT_DESIGN_TOOL_PROGRESS", {
              completed: generation.progressCompleted,
              total: generation.progressTotal,
            })}
          </p>
        </div>
      ) : null}

      {generation.candidates.length > 0 ? (
        <div className="divide-y divide-border/60">
          {generation.candidates.map((candidate) => {
            const blockers = candidate.changeSet.issues.filter(
              (issue) => issue.severity === "blocker",
            ).length;
            const warnings = candidate.changeSet.issues.filter(
              (issue) => issue.severity === "warning",
            ).length;
            return (
              <article key={candidate.candidateIndex} className="flex items-start gap-3 px-4 py-3">
                <SwatchBook
                  className="mt-0.5 size-4 shrink-0 text-label-secondary"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-footnote font-semibold text-label-primary">
                      {t("ai:AI_CHAT_DESIGN_TOOL_CANDIDATE", {
                        index: candidate.candidateIndex + 1,
                      })}
                    </p>
                    <Badge variant="outline">
                      {t("ai:AI_CHAT_DESIGN_TOOL_OPERATION_COUNT", {
                        count: candidate.changeSet.operations.length,
                      })}
                    </Badge>
                    {blockers > 0 ? (
                      <Badge variant="destructive">
                        {t("ai:AI_CHAT_DESIGN_TOOL_BLOCKER_COUNT", { count: blockers })}
                      </Badge>
                    ) : null}
                    {warnings > 0 ? (
                      <Badge variant="outline" className="border-warning/50 text-warning">
                        {t("ai:AI_CHAT_DESIGN_TOOL_WARNING_COUNT", { count: warnings })}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-caption leading-relaxed text-label-secondary">
                    {t("ai:AI_CHAT_DESIGN_TOOL_TARGET_COUNT", {
                      count: candidate.changeSet.affectedTargets.length,
                    })}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {generation.failures.length > 0 ? (
        <div className="border-t border-border/60 px-4 py-3">
          <p className="text-caption font-semibold text-label-primary">
            {t("ai:AI_CHAT_DESIGN_TOOL_FAILURE_COUNT", {
              count: generation.failures.length,
            })}
          </p>
          <ul className="mt-2 space-y-2">
            {generation.failures.map((failure) => (
              <li
                key={`${failure.candidateIndex}:${failure.code}`}
                className="text-caption leading-relaxed text-label-secondary"
              >
                <span className="font-mono text-label-primary">{failure.code}</span>
                <span aria-hidden="true"> · </span>
                {t(failure.messageKey, { ns: "errors", defaultValue: failure.code })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
        <p className="min-w-0 flex-1 text-caption leading-relaxed text-label-secondary">
          {t("ai:AI_CHAT_DESIGN_TOOL_REVIEW_HINT")}
        </p>
        <a
          href={buildProjectEditorHref(projectId, {
            stage: "design",
            page: selectedPageId,
          })}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("ai:AI_CHAT_DESIGN_TOOL_OPEN_EDITOR")}
          <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
