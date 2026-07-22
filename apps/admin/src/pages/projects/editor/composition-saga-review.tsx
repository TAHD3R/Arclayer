import { Button } from "@arclayer/ui/button";
import type { BuilderChangeSetPreviewOut } from "@arclayer/openapi";
import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { WireframeGenerationTargetOption } from "@/pages/projects/editor/wireframe-generation-targets";

export function CompositionSagaReview({
  phase,
  preview,
  targets,
  applying,
  onApply,
  onDiscard,
}: Readonly<{
  phase: "planning" | "composition";
  preview: BuilderChangeSetPreviewOut;
  targets: readonly WireframeGenerationTargetOption[];
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
}>) {
  const { t } = useTranslation(["account", "errors"]);
  const blockers = preview.issues.filter((issue) => issue.severity === "blocker");
  const operationCounts = new Map<string, number>();
  for (const operation of preview.operations) {
    if ("itemId" in operation) {
      operationCounts.set(operation.itemId, (operationCounts.get(operation.itemId) ?? 0) + 1);
    }
  }
  const affectedTargets = targets.filter((target) => operationCounts.has(target.target.itemId));

  return (
    <section
      className="absolute right-4 bottom-4 left-4 z-30 flex items-end justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.08)]"
      aria-label={t("CREATION_EDITOR_COMPOSITION_SAGA_REVIEW_LABEL")}
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-footnote font-semibold text-label-primary">
          {t(`CREATION_EDITOR_COMPOSITION_SAGA_REVIEW_${phase.toUpperCase()}_TITLE`)}
        </h2>
        <p className="mt-1 text-caption text-label-secondary">
          {t(`CREATION_EDITOR_COMPOSITION_SAGA_REVIEW_${phase.toUpperCase()}_DESC`, {
            operations: preview.operations.length,
            targets: affectedTargets.length,
          })}
        </p>
        {affectedTargets.length > 0 ? (
          <ol className="mt-2 flex max-w-[min(52rem,60vw)] gap-2 overflow-x-auto pb-1">
            {affectedTargets.map((target, index) => (
              <li
                key={`${target.target.kind}:${target.target.itemId}`}
                className="min-w-40 shrink-0 border-l border-border pl-2.5"
              >
                <p className="truncate text-caption font-medium text-label-primary">
                  <span className="mr-1.5 font-mono text-label-secondary">{index + 1}</span>
                  {target.title}
                </p>
                <p className="mt-0.5 text-caption text-label-secondary">
                  {t("CREATION_EDITOR_COMPOSITION_SAGA_REVIEW_TARGET_EVIDENCE", {
                    operations: operationCounts.get(target.target.itemId) ?? 0,
                  })}
                </p>
              </li>
            ))}
          </ol>
        ) : null}
        {blockers.length > 0 ? (
          <p className="mt-2 flex items-center gap-2 text-caption text-destructive">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {t("CREATION_EDITOR_COMPOSITION_SAGA_REVIEW_BLOCKERS", {
              count: blockers.length,
            })}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={onDiscard}>
          <X className="mr-2 size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_COMPOSITION_SAGA_DISCARD_CANDIDATE")}
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={applying || blockers.length > 0}
          loading={applying}
          onClick={onApply}
        >
          {t(`CREATION_EDITOR_COMPOSITION_SAGA_APPLY_${phase.toUpperCase()}`)}
        </Button>
      </div>
    </section>
  );
}
