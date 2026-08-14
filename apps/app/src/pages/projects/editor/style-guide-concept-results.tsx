import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@arclayer/lib/utils";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Progress } from "@arclayer/ui/progress";
import { Textarea } from "@arclayer/ui/textarea";
import { AlertCircleIcon, CheckIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  PROJECT_DESIGN_SYSTEM_QUERY_KEY,
  submitProjectDesignSystemConceptFeedback,
} from "@/api/project-design-systems";
import { getErrorMessage, notifyError } from "@/lib/notifications";
import type { ProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";
import { StyleGuideFoundationPreview } from "@/pages/projects/editor/style-guide-foundation-preview";

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
        <div
          className={cn(
            "mt-4 grid gap-4",
            result.candidates.length === 1
              ? "max-w-2xl"
              : result.candidates.length === 2
                ? "xl:grid-cols-2"
                : "xl:grid-cols-3",
          )}
          data-style-concept-pitch=""
        >
          {result.candidates.map((candidate) => (
            <ConceptPitchColumn
              key={candidate.candidateIndex}
              controller={controller}
              candidateIndex={candidate.candidateIndex}
            />
          ))}
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

function ConceptPitchColumn({
  controller,
  candidateIndex,
}: {
  controller: ProjectStyleGuideController;
  candidateIndex: number;
}) {
  const { t } = useTranslation("account");
  const queryClient = useQueryClient();
  const { generation } = controller;
  const candidate = generation.generation?.candidates.find(
    (item) => item.candidateIndex === candidateIndex,
  );
  const [commentDraft, setCommentDraft] = useState("");
  const selected = generation.selectedCandidateIndex === candidateIndex;
  const [feedbackPendingIndex, setFeedbackPendingIndex] = useState(false);

  const feedbackMutation = useMutation({
    mutationFn: async (comment: string) => {
      const result = generation.generation;
      if (!result) throw new Error("CREATION_EDITOR_STYLE_AI_GENERATION_REQUIRED");
      return submitProjectDesignSystemConceptFeedback(
        controller.projectId,
        result.designSystemId,
        result.generationId,
        {
          conceptIndex: candidateIndex,
          comment,
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROJECT_DESIGN_SYSTEM_QUERY_KEY });
    },
    onError: notifyError,
  });

  if (!candidate) return null;
  const valid = candidate.validation.status === "valid";
  const feedbackEntries = candidate.feedback ?? [];

  const selectConcept = () => {
    const comment = commentDraft.trim();
    if (comment) {
      setFeedbackPendingIndex(true);
      feedbackMutation.mutate(comment, {
        onSettled: () => {
          setFeedbackPendingIndex(false);
          setCommentDraft("");
        },
      });
    }
    controller.reviewGeneratedCandidate(candidateIndex);
  };

  return (
    <article
      data-style-concept-column={candidateIndex}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-card p-4 transition-[border-color,box-shadow]",
        selected
          ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
          : "border-border hover:border-label-secondary/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-footnote font-semibold text-label-primary">
          {t("account:CREATION_EDITOR_STYLE_AI_CANDIDATE", { index: candidateIndex + 1 })}
        </span>
        <Badge variant={valid ? "outline" : "destructive"}>
          {t(
            valid
              ? "account:CREATION_EDITOR_STYLE_AI_VALID"
              : "account:CREATION_EDITOR_STYLE_AI_INVALID",
          )}
        </Badge>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-label-secondary">{candidate.summary}</p>

      <div className="mt-4">
        <StyleGuideFoundationPreview manifest={candidate.version.manifest} candidate compact />
      </div>

      <div className="mt-auto pt-4">
        <label
          htmlFor={`style-concept-feedback-${candidateIndex}`}
          className="text-caption font-semibold text-label-primary"
        >
          {t("account:CREATION_EDITOR_STYLE_AI_FEEDBACK_LABEL")}
        </label>
        {feedbackEntries.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {feedbackEntries.map((entry, entryIndex) => (
              <li
                key={`${entry.createdAt}-${entryIndex}`}
                className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-caption leading-relaxed text-label-secondary"
              >
                {entry.comment}
              </li>
            ))}
          </ul>
        ) : null}
        <Textarea
          id={`style-concept-feedback-${candidateIndex}`}
          value={commentDraft}
          onChange={(event) => setCommentDraft(event.target.value)}
          placeholder={t("account:CREATION_EDITOR_STYLE_AI_FEEDBACK_PLACEHOLDER")}
          className="mt-2 min-h-16 resize-none text-footnote"
          maxLength={2000}
          aria-label={t("account:CREATION_EDITOR_STYLE_AI_FEEDBACK_LABEL")}
        />
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant={selected ? "secondary" : "default"}
            loading={feedbackPendingIndex}
            disabled={generation.active}
            title={valid ? undefined : t("account:CREATION_EDITOR_STYLE_AI_INVALID_SELECT_HINT")}
            onClick={selectConcept}
          >
            {selected ? <CheckIcon data-icon="inline-start" /> : null}
            {selected
              ? t("account:CREATION_EDITOR_STYLE_AI_SELECTED")
              : t("account:CREATION_EDITOR_STYLE_AI_REVIEW", {
                  version: candidate.version.versionNumber,
                })}
          </Button>
          {feedbackMutation.isPending ? (
            <span className="text-caption text-label-secondary">
              {t("account:CREATION_EDITOR_STYLE_AI_FEEDBACK_SUBMITTING")}
            </span>
          ) : null}
        </div>
        {feedbackMutation.error ? (
          <p role="alert" className="mt-2 text-caption text-destructive">
            {getErrorMessage(feedbackMutation.error)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function namespacedKey(namespace: "ai" | "errors", key: string) {
  return key.includes(":") ? key : `${namespace}:${key}`;
}
