import { Button } from "@arclayer/ui/button";
import type { BuilderChangeSetPreviewOut } from "@arclayer/openapi";
import { AlertTriangle, Check, ChevronDown, ChevronUp, ListChecks, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function SitemapChangeReview({
  preview,
  applying,
  onApply,
  onDiscard,
}: {
  preview: BuilderChangeSetPreviewOut;
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation("account");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const blockers = preview.issues.filter((issue) => issue.severity === "blocker");
  const ready = blockers.length === 0;
  const summary = summarizeOperations(preview);

  return (
    <section
      className="absolute bottom-4 left-1/2 z-30 w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-border bg-background shadow-[0_12px_30px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.08)]"
      aria-label={t("CREATION_EDITOR_SITEMAP_REVIEW_LABEL")}
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={
            "flex size-9 shrink-0 items-center justify-center rounded-lg " +
            (ready ? "bg-positive/10 text-positive" : "bg-warning/10 text-warning")
          }
        >
          {ready ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-footnote font-semibold text-label-primary">
            {ready
              ? t("CREATION_EDITOR_SITEMAP_REVIEW_READY_TITLE", {
                  operations: preview.operations.length,
                })
              : t("CREATION_EDITOR_SITEMAP_REVIEW_CHECK_TITLE", {
                  operations: preview.operations.length,
                })}
          </p>
          <p className="truncate text-caption text-label-secondary">{summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t(
              detailsOpen
                ? "CREATION_EDITOR_SITEMAP_REVIEW_HIDE"
                : "CREATION_EDITOR_SITEMAP_REVIEW_DETAILS",
            )}
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronUp className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Button type="button" variant="outline" disabled={applying} onClick={onDiscard}>
            <Trash2 className="size-4" aria-hidden="true" />
            {t("CREATION_EDITOR_WIREFRAME_DISCARD_PREVIEW")}
          </Button>
          <Button type="button" disabled={applying || blockers.length > 0} onClick={onApply}>
            {applying
              ? t("CREATION_EDITOR_WIREFRAME_APPLYING")
              : t("CREATION_EDITOR_WIREFRAME_APPLY_PREVIEW")}
          </Button>
        </div>
      </div>
      {detailsOpen ? (
        <div className="border-t border-border px-4 py-3">
          <p className="flex items-center gap-1.5 text-caption font-medium text-label-secondary">
            <ListChecks className="size-3.5" aria-hidden="true" />
            {t("CREATION_EDITOR_SITEMAP_REVIEW_OPERATION_DETAILS")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {preview.operations.map((operation, index) => (
              <li
                key={`${operation.operationId}:${index}`}
                className="flex items-center gap-2 text-caption text-label-secondary"
              >
                <span className="inline-flex shrink-0 items-center rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                  {operation.type}
                </span>
                <span className="min-w-0 truncate">{describeOperation(operation)}</span>
              </li>
            ))}
          </ul>
          {blockers.length > 0 ? (
            <div className="mt-3 rounded-lg border border-negative/30 bg-negative/5 px-3 py-2">
              <p className="text-caption font-medium text-negative">
                {t("CREATION_EDITOR_SITEMAP_REVIEW_BLOCKERS", { count: blockers.length })}
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                {blockers.map((issue, index) => (
                  <li key={index} className="text-caption text-negative">
                    {t(issue.messageKey, { ns: "errors" })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function summarizeOperations(preview: BuilderChangeSetPreviewOut) {
  const counts = new Map<string, number>();
  for (const operation of preview.operations) {
    counts.set(operation.type, (counts.get(operation.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => `${type} × ${count}`).join(" · ");
}

type PreviewOperation = BuilderChangeSetPreviewOut["operations"][number];

function describeOperation(operation: PreviewOperation): string {
  if ("title" in operation && typeof operation.title === "string") return operation.title;
  if ("label" in operation && typeof operation.label === "string") return operation.label;
  if ("sectionIntents" in operation && Array.isArray(operation.sectionIntents)) {
    return `${operation.sectionIntents.length} sections`;
  }
  return operation.type;
}
