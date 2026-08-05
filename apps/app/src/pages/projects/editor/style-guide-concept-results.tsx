import { cn } from "@arclayer/lib/utils";
import { Badge } from "@arclayer/ui/badge";
import { Progress } from "@arclayer/ui/progress";
import { AlertCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";

export function StyleGuideConceptResults({
  controller,
}: {
  controller: ProjectStyleGuideController;
}) {
  const { t } = useTranslation(["account", "ai", "errors"]);
  const { generation } = controller;
  const result = generation.generation;
  if (!result) return null;

  const progress =
    result.progressTotal && result.progressTotal > 0
      ? Math.min(100, (result.progressCompleted / result.progressTotal) * 100)
      : null;
  const activeStatusMessageKey = generation.active
    ? result.statusKey
      ? namespacedKey("ai", result.statusKey)
      : "account:CREATION_EDITOR_STYLE_AI_RUNNING"
    : null;

  return (
    <div className="border-t border-border/60 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-body font-semibold text-label-primary">
            {t("account:CREATION_EDITOR_STYLE_AI_RESULTS_TITLE")}
          </h3>
          {activeStatusMessageKey ? (
            <p className="mt-1 text-caption text-label-secondary">{t(activeStatusMessageKey)}</p>
          ) : null}
        </div>
        <Badge
          variant={
            result.status === "failed"
              ? "destructive"
              : result.status === "succeeded" || result.status === "partial"
                ? "default"
                : "outline"
          }
        >
          {t(`ai:AI_CHAT_STYLE_GUIDE_TOOL_STATUS_${result.status.toUpperCase()}`)}
        </Badge>
      </div>

      {generation.active && progress !== null ? (
        <div className="mt-4 space-y-2" aria-live="polite">
          <Progress value={progress} />
          <p className="text-caption text-label-secondary">
            {t("account:CREATION_EDITOR_STYLE_AI_PROGRESS", {
              completed: result.progressCompleted,
              total: result.progressTotal,
            })}
          </p>
        </div>
      ) : null}

      {result.failures.length > 0 ? (
        <div className="mt-4 space-y-2">
          {result.failures.map((failure) => (
            <div
              key={`${failure.candidateIndex}:${failure.code}`}
              className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
            >
              <AlertCircleIcon
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <div>
                <p className="text-footnote font-semibold text-label-primary">
                  {t("account:CREATION_EDITOR_STYLE_AI_CANDIDATE_FAILED", {
                    index: failure.candidateIndex + 1,
                  })}
                </p>
                <p className="mt-1 text-caption text-label-secondary">
                  {t(namespacedKey("errors", failure.messageKey), failure.meta)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {result.candidates.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {result.candidates.map((candidate) => {
            const selected = generation.selectedCandidateIndex === candidate.candidateIndex;
            const valid = candidate.validation.status === "valid";
            return (
              <button
                key={candidate.candidateIndex}
                type="button"
                aria-pressed={selected}
                onClick={() => controller.reviewGeneratedCandidate(candidate.candidateIndex)}
                className={cn(
                  "min-h-36 rounded-lg border p-4 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  selected
                    ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]"
                    : "border-border bg-background hover:bg-muted/45",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-footnote font-semibold text-label-primary">
                    {t("account:CREATION_EDITOR_STYLE_AI_CANDIDATE", {
                      index: candidate.candidateIndex + 1,
                    })}
                  </span>
                  <Badge variant={valid ? "outline" : "destructive"}>
                    {t(
                      valid
                        ? "account:CREATION_EDITOR_STYLE_AI_VALID"
                        : "account:CREATION_EDITOR_STYLE_AI_INVALID",
                    )}
                  </Badge>
                </span>
                <span className="mt-2 block text-caption leading-relaxed text-label-secondary">
                  {candidate.summary}
                </span>
                <span className="mt-3 block text-caption font-medium text-label-primary">
                  {selected
                    ? t("account:CREATION_EDITOR_STYLE_AI_SELECTED")
                    : t("account:CREATION_EDITOR_STYLE_AI_REVIEW", {
                        version: candidate.version.versionNumber,
                      })}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {result.candidates.length > 0 && !generation.active ? (
        <p className="mt-4 text-caption leading-relaxed text-label-secondary">
          {t("account:CREATION_EDITOR_STYLE_AI_NO_AUTO_APPLY")}
        </p>
      ) : null}
    </div>
  );
}

function namespacedKey(namespace: "ai" | "errors", key: string) {
  return key.includes(":") ? key : `${namespace}:${key}`;
}
