import { Button } from "@arclayer/ui/button";
import type { BuilderChangeSetPreviewOut } from "@arclayer/openapi";
import { AlertTriangle, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";

export function DesignChangeReview({
  preview,
  pageItemId,
  applying,
  onApply,
  onDiscard,
  candidateLabel,
  revisionNumber,
  applyDisabled = false,
  applyDisabledReason = null,
}: Readonly<{
  preview: BuilderChangeSetPreviewOut;
  pageItemId: string;
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
  candidateLabel?: string;
  revisionNumber: number;
  applyDisabled?: boolean;
  applyDisabledReason?: string | null;
}>) {
  const { t } = useTranslation(["account", "errors"]);
  const blockers = preview.issues.filter((issue) => issue.severity === "blocker");
  const candidate = preview.designCandidates?.find((item) => item.itemId === pageItemId) ?? null;
  const changedSections = candidate?.visualBlueprint.sections?.length ?? 0;

  return (
    <section
      className="absolute right-4 bottom-4 left-4 z-30 flex flex-col gap-4 rounded-xl border border-border bg-background px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.16),0_2px_8px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between"
      aria-label={t("CREATION_EDITOR_DESIGN_REVIEW_LABEL")}
      aria-live="polite"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-footnote font-semibold text-label-primary">
            {t("CREATION_EDITOR_DESIGN_REVIEW_TITLE")}
          </h2>
          <BaseTag icon={lucideTagIcon(preview.approvalClass === "none" ? Check : AlertTriangle)}>
            {t(`CREATION_EDITOR_WIREFRAME_APPROVAL_${preview.approvalClass.toUpperCase()}`)}
          </BaseTag>
          <BaseTag color="gold">
            {candidateLabel ?? t("CREATION_EDITOR_DESIGN_SERVER_CANDIDATE")}
          </BaseTag>
        </div>
        <p className="mt-1 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_DESIGN_REVIEW_DESC", {
            operations: preview.operations.length,
            sections: changedSections,
          })}
        </p>
        <p className="mt-1 text-caption text-label-secondary">
          {t("CREATION_EDITOR_DESIGN_REVIEW_CANVAS_CANONICAL", { revision: revisionNumber })}
        </p>
        {blockers.length > 0 ? (
          <div className="mt-2 flex items-start gap-2 text-caption text-negative">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <ul className="space-y-0.5">
              {blockers.slice(0, 3).map((issue, index) => (
                <li key={`${issue.code}:${issue.operationId ?? index}`}>
                  {t(issue.messageKey, { ns: "errors" })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={applying}
          onClick={onDiscard}
        >
          <X className="mr-2 size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_DESIGN_DISCARD")}
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={applying || blockers.length > 0 || !candidate || applyDisabled}
          title={applyDisabled ? (applyDisabledReason ?? undefined) : undefined}
          onClick={onApply}
        >
          {applying ? t("CREATION_EDITOR_DESIGN_APPLYING") : t("CREATION_EDITOR_DESIGN_APPLY")}
        </Button>
      </div>
    </section>
  );
}
