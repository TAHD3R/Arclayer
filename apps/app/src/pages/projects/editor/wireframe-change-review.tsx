import { Button } from "@arclayer/ui/button";
import type { BuilderChangeSetPreviewOut } from "@arclayer/openapi";
import { AlertTriangle, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import type { WireframeGenerationTargetOption } from "@/pages/projects/editor/wireframe-generation-targets";

export function WireframeChangeReview({
  preview,
  targets,
  applying,
  onApply,
  onDiscard,
}: {
  preview: BuilderChangeSetPreviewOut;
  targets?: readonly WireframeGenerationTargetOption[];
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation(["account", "errors"]);
  const blockers = preview.issues.filter((issue) => issue.severity === "blocker");
  const hosts = buildHostEvidence(preview, targets ?? []);
  return (
    <section
      className="absolute right-4 bottom-4 left-4 z-30 flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.08)]"
      aria-label={t("CREATION_EDITOR_WIREFRAME_REVIEW_LABEL")}
      aria-live="polite"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-footnote font-semibold text-label-primary">
            {t("CREATION_EDITOR_WIREFRAME_REVIEW_TITLE")}
          </h2>
          <BaseTag icon={lucideTagIcon(preview.approvalClass === "none" ? Check : AlertTriangle)}>
            {t(`CREATION_EDITOR_WIREFRAME_APPROVAL_${preview.approvalClass.toUpperCase()}`)}
          </BaseTag>
        </div>
        <p className="mt-1 truncate text-caption text-label-secondary">
          {t("CREATION_EDITOR_WIREFRAME_REVIEW_DESC", {
            operations: preview.operations.length,
            targets: preview.wireframeCandidates?.length ?? 0,
          })}
        </p>
        {hosts.length > 1 ? (
          <ol
            className="mt-2 flex max-w-[min(52rem,60vw)] gap-2 overflow-x-auto pb-1"
            aria-label={t("CREATION_EDITOR_WIREFRAME_REVIEW_TARGETS")}
          >
            {hosts.map((host, index) => (
              <li
                key={`${host.kind}:${host.itemId}`}
                className="min-w-40 shrink-0 rounded-md border border-border bg-muted/35 px-2.5 py-2"
              >
                <p className="truncate text-caption font-medium text-label-primary">
                  <span className="mr-1.5 font-mono text-label-secondary">{index + 1}</span>
                  {host.title}
                </p>
                <p className="mt-0.5 text-caption text-label-secondary">
                  {t("CREATION_EDITOR_WIREFRAME_REVIEW_TARGET_EVIDENCE", {
                    operations: host.operationCount,
                  })}
                </p>
              </li>
            ))}
          </ol>
        ) : null}
        {blockers.length > 0 ? (
          <div className="mt-2 flex items-start gap-2 text-caption text-negative">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <div>
              <p>{t("CREATION_EDITOR_WIREFRAME_REVIEW_BLOCKERS", { count: blockers.length })}</p>
              <ul className="mt-1 space-y-0.5">
                {blockers.slice(0, 3).map((issue, index) => (
                  <li key={`${issue.code}:${issue.operationId ?? index}`}>
                    {t(issue.messageKey, { ns: "errors" })}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={applying}
          onClick={onDiscard}
        >
          <X className="mr-2 size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_WIREFRAME_DISCARD_PREVIEW")}
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={applying || blockers.length > 0}
          onClick={onApply}
        >
          {applying
            ? t("CREATION_EDITOR_WIREFRAME_APPLYING")
            : t("CREATION_EDITOR_WIREFRAME_APPLY_PREVIEW")}
        </Button>
      </div>
    </section>
  );
}

function buildHostEvidence(
  preview: BuilderChangeSetPreviewOut,
  targets: readonly WireframeGenerationTargetOption[],
) {
  const candidates = preview.wireframeCandidates ?? [];
  const targetByItemId = new Map(targets.map((target) => [target.target.itemId, target]));
  const candidateByItemId = new Map(candidates.map((candidate) => [candidate.itemId, candidate]));
  const orderedItemIds = [
    ...targets.flatMap((target) =>
      candidateByItemId.has(target.target.itemId) ? [target.target.itemId] : [],
    ),
    ...candidates.flatMap((candidate) =>
      targetByItemId.has(candidate.itemId) ? [] : [candidate.itemId],
    ),
  ];
  return orderedItemIds.map((itemId) => {
    const candidate = candidateByItemId.get(itemId);
    const target = targetByItemId.get(itemId);
    return {
      itemId,
      kind: target?.target.kind ?? candidate?.hostKind ?? "page",
      title: target?.title ?? itemId,
      operationCount: preview.operations.filter(
        (operation) => "itemId" in operation && operation.itemId === itemId,
      ).length,
    };
  });
}
