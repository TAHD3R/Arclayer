import type { DesignSystemConceptGenerationOut } from "@arclayer/openapi";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleXIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@arclayer/ui/badge";
import { Progress } from "@arclayer/ui/progress";
import { STYLE_GUIDE_TERMINAL_STATUSES } from "@/components/ai/style-guide-generate-tool-contract";

export function StyleGuideGenerationStatus({
  generation,
}: {
  generation: DesignSystemConceptGenerationOut;
}) {
  const { t } = useTranslation(["ai"]);
  const terminal = STYLE_GUIDE_TERMINAL_STATUSES.has(generation.status);
  const failed = generation.status === "failed";
  const cancelled = generation.status === "cancelled";
  const complete = generation.status === "succeeded" || generation.status === "partial";
  const progress =
    generation.progressTotal && generation.progressTotal > 0
      ? Math.min(100, (generation.progressCompleted / generation.progressTotal) * 100)
      : null;
  const StatusIcon =
    failed || cancelled ? CircleXIcon : complete ? CheckCircle2Icon : LoaderCircleIcon;

  return (
    <section
      aria-label={t("ai:AI_CHAT_STYLE_GUIDE_TOOL_TITLE")}
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
              {t(`ai:AI_CHAT_STYLE_GUIDE_TOOL_STATUS_${generation.status.toUpperCase()}`)}
            </h3>
            <Badge variant={failed ? "destructive" : complete ? "default" : "outline"}>
              {t("ai:AI_CHAT_STYLE_GUIDE_TOOL_CANDIDATE_COUNT", {
                count: generation.candidates.length,
              })}
            </Badge>
          </div>
          <p className="mt-0.5 text-caption leading-relaxed text-label-secondary">
            {generation.statusKey
              ? t(generation.statusKey)
              : t("ai:AI_CHAT_STYLE_GUIDE_TOOL_RUNNING")}
          </p>
        </div>
      </div>

      {!terminal && progress !== null ? (
        <div className="space-y-2 border-b border-border/60 px-4 py-3">
          <Progress value={progress} />
          <p className="text-caption text-label-secondary">
            {t("ai:AI_CHAT_STYLE_GUIDE_TOOL_PROGRESS", {
              completed: generation.progressCompleted,
              total: generation.progressTotal,
            })}
          </p>
        </div>
      ) : null}

      {generation.candidates.length > 0 ? (
        <div className="divide-y divide-border/60">
          {generation.candidates.map((candidate) => (
            <article key={candidate.candidateIndex} className="flex items-start gap-3 px-4 py-3">
              {candidate.validation.status === "valid" ? (
                <ShieldCheckIcon
                  className="mt-0.5 size-4 shrink-0 text-positive"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangleIcon
                  className="mt-0.5 size-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-footnote font-semibold text-label-primary">
                    {t("ai:AI_CHAT_STYLE_GUIDE_TOOL_VERSION", {
                      version: candidate.version.versionNumber,
                    })}
                  </p>
                  <Badge variant="outline">
                    {t(
                      candidate.validation.status === "valid"
                        ? "ai:AI_CHAT_STYLE_GUIDE_TOOL_VALID"
                        : "ai:AI_CHAT_STYLE_GUIDE_TOOL_INVALID",
                    )}
                  </Badge>
                </div>
                <p className="mt-1 text-caption leading-relaxed text-label-secondary">
                  {candidate.summary}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {generation.failures.length > 0 ? (
        <div className="border-t border-border/60 px-4 py-3 text-caption text-label-secondary">
          {t("ai:AI_CHAT_STYLE_GUIDE_TOOL_FAILURE_COUNT", {
            count: generation.failures.length,
          })}
        </div>
      ) : null}

      {complete ? (
        <p className="border-t border-border/60 px-4 py-3 text-caption text-label-secondary">
          {t("ai:AI_CHAT_STYLE_GUIDE_TOOL_REVIEW_HINT")}
        </p>
      ) : null}
    </section>
  );
}
