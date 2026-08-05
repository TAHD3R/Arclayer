import { Badge } from "@arclayer/ui/badge";
import type { BuilderGenerationOut } from "@arclayer/openapi";
import { useTranslation } from "react-i18next";

type BuilderOperation =
  BuilderGenerationOut["candidates"][number]["changeSet"]["operations"][number];

function operationSummary(operation: BuilderOperation) {
  switch (operation.type) {
    case "page.create":
      return `${operation.title} · ${operation.path}`;
    case "page.rename":
      return operation.title;
    case "page.move":
      return operation.parentItemId ?? "Root";
    case "page.reorder":
      return `#${operation.sortOrder + 1}`;
    case "page.delete":
      return operation.itemId;
    case "route.set":
      return operation.path;
    case "route.disable":
      return operation.itemId;
  }
}

export function GenerationStatus({ status }: { status: BuilderGenerationOut["status"] }) {
  const { t } = useTranslation("account");
  const variant =
    status === "failed" ? "destructive" : status === "succeeded" ? "default" : "outline";
  return <Badge variant={variant}>{t(`CREATION_EDITOR_AI_STATUS_${status.toUpperCase()}`)}</Badge>;
}

export function CandidateReview({
  generation,
  candidateIndex,
}: {
  generation: BuilderGenerationOut;
  candidateIndex: number;
}) {
  const { t } = useTranslation("account");
  const candidate = generation.candidates.find((item) => item.candidateIndex === candidateIndex);
  if (!candidate) return null;
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="border-b border-border px-3 py-2.5">
        <p className="text-footnote font-medium text-label-primary">
          {t("CREATION_EDITOR_AI_CHANGES", { count: candidate.changeSet.operations.length })}
        </p>
      </div>
      <div className="divide-y divide-border">
        {candidate.changeSet.operations.map((operation) => (
          <div key={operation.operationId} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-caption font-semibold text-label-primary">
                {t(`CREATION_EDITOR_OPERATION_${operation.type.replace(".", "_").toUpperCase()}`)}
              </span>
              <code className="max-w-44 truncate text-caption text-label-secondary">
                {operationSummary(operation)}
              </code>
            </div>
          </div>
        ))}
      </div>
      {candidate.changeSet.issues.length > 0 ? (
        <div className="border-t border-border px-3 py-2.5 text-caption text-label-secondary">
          {t("CREATION_EDITOR_AI_ISSUES", { count: candidate.changeSet.issues.length })}
        </div>
      ) : null}
    </div>
  );
}
