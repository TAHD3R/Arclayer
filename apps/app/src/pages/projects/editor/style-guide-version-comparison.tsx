import { ArrowRight, CircleDashed, GitCompareArrows, GitFork, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  DesignSystemManifestDiffEntryOut,
  DesignSystemManifestDiffKind,
  DesignSystemManifestDiffOperation,
} from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { getErrorMessage } from "@/lib/notifications";
import { shortStyleGuideHash } from "@/pages/projects/editor/style-guide-format";
import { StyleGuideVersionImpact } from "@/pages/projects/editor/style-guide-version-impact";
import type { ProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";

const DIFF_KIND_KEYS: Record<DesignSystemManifestDiffKind, string> = {
  asset_reference: "CREATION_EDITOR_STYLE_DIFF_KIND_ASSET_REFERENCE",
  breakpoint: "CREATION_EDITOR_STYLE_DIFF_KIND_BREAKPOINT",
  component_catalog: "CREATION_EDITOR_STYLE_DIFF_KIND_COMPONENT_CATALOG",
  component_recipe: "CREATION_EDITOR_STYLE_DIFF_KIND_COMPONENT_RECIPE",
  component_token: "CREATION_EDITOR_STYLE_DIFF_KIND_COMPONENT_TOKEN",
  extension: "CREATION_EDITOR_STYLE_DIFF_KIND_EXTENSION",
  metadata: "CREATION_EDITOR_STYLE_DIFF_KIND_METADATA",
  motion_role: "CREATION_EDITOR_STYLE_DIFF_KIND_MOTION_ROLE",
  primitive_token: "CREATION_EDITOR_STYLE_DIFF_KIND_PRIMITIVE_TOKEN",
  semantic_token: "CREATION_EDITOR_STYLE_DIFF_KIND_SEMANTIC_TOKEN",
  theme: "CREATION_EDITOR_STYLE_DIFF_KIND_THEME",
  typography_role: "CREATION_EDITOR_STYLE_DIFF_KIND_TYPOGRAPHY_ROLE",
};

const DIFF_OPERATION_KEYS: Record<DesignSystemManifestDiffOperation, string> = {
  added: "CREATION_EDITOR_STYLE_DIFF_OPERATION_ADDED",
  changed: "CREATION_EDITOR_STYLE_DIFF_OPERATION_CHANGED",
  removed: "CREATION_EDITOR_STYLE_DIFF_OPERATION_REMOVED",
};

export function StyleGuideVersionComparison({
  controller,
}: {
  controller: ProjectStyleGuideController;
}) {
  const { t } = useTranslation("account");
  const history = controller.history;
  if (!history.selectedFromVersionId) return null;

  return (
    <section
      className="mt-5 border-t border-border pt-5"
      role="region"
      aria-label={t("CREATION_EDITOR_STYLE_COMPARISON_LABEL")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-footnote font-semibold text-label-primary">
            <GitCompareArrows className="size-4" aria-hidden="true" />
            {t("CREATION_EDITOR_STYLE_COMPARISON_TITLE")}
          </h3>
          <p className="mt-1 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_STYLE_COMPARISON_DESC")}
          </p>
        </div>
        <Button
          className="min-h-11 min-w-11 xl:min-h-8 xl:min-w-8"
          size="icon-sm"
          variant="ghost"
          aria-label={t("CREATION_EDITOR_STYLE_COMPARISON_CLOSE")}
          onClick={history.clearComparison}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      {history.comparisonQuery.isPending ? (
        <p
          className="mt-4 flex min-h-11 items-center gap-2 text-caption text-label-secondary"
          role="status"
        >
          <CircleDashed className="size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_STYLE_COMPARISON_LOADING")}
        </p>
      ) : null}
      {history.comparisonQuery.error ? (
        <div className="mt-4 border-l border-destructive/40 pl-4" role="alert">
          <p className="text-caption leading-5 text-label-primary">
            {getErrorMessage(history.comparisonQuery.error)}
          </p>
          <Button
            className="mt-3 min-h-11 xl:min-h-8"
            size="sm"
            variant="outline"
            onClick={() => void history.comparisonQuery.refetch()}
          >
            {t("CREATION_EDITOR_STYLE_COMPARISON_RETRY")}
          </Button>
        </div>
      ) : null}
      {history.comparison ? <ComparisonResult comparison={history.comparison} /> : null}
      <StyleGuideVersionImpact controller={controller} />
    </section>
  );
}

function ComparisonResult({
  comparison,
}: {
  comparison: NonNullable<ProjectStyleGuideController["history"]["comparison"]>;
}) {
  const { t } = useTranslation("account");
  const entries = comparison.diff.entries ?? [];
  return (
    <div className="mt-4">
      <p className="font-mono text-footnote font-semibold text-label-primary tabular-nums">
        v{comparison.fromVersion.versionNumber}{" "}
        <ArrowRight className="inline size-3.5" aria-hidden="true" /> v
        {comparison.toVersion.versionNumber}
      </p>
      <p className="mt-1 text-caption leading-5 text-label-secondary tabular-nums">
        {t("CREATION_EDITOR_STYLE_COMPARISON_SUMMARY", {
          added: comparison.diff.addedCount,
          changed: comparison.diff.changedCount,
          removed: comparison.diff.removedCount,
        })}
      </p>
      {entries.length === 0 ? (
        <p className="mt-3 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_STYLE_COMPARISON_NO_CHANGES")}
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border border-y border-border">
          {entries.map((entry) => (
            <ComparisonEntry key={`${entry.kind}:${entry.path}`} entry={entry} />
          ))}
        </ol>
      )}
      <p className="mt-3 font-mono text-caption text-label-tertiary tabular-nums">
        {shortStyleGuideHash(comparison.comparisonHash)}
      </p>
    </div>
  );
}

function ComparisonEntry({ entry }: { entry: DesignSystemManifestDiffEntryOut }) {
  const { t } = useTranslation("account");
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35">
          <span className="min-w-0">
            <span className="block truncate font-mono text-label-primary">{entry.path}</span>
            <span className="mt-0.5 block text-label-secondary">
              {t(DIFF_KIND_KEYS[entry.kind])} · {t(DIFF_OPERATION_KEYS[entry.operation])}
            </span>
          </span>
          <GitFork className="size-3.5 shrink-0 text-label-tertiary" aria-hidden="true" />
        </summary>
        <div className="grid gap-2 pb-3">
          <DiffValue label={t("CREATION_EDITOR_STYLE_COMPARISON_BEFORE")} value={entry.before} />
          <DiffValue label={t("CREATION_EDITOR_STYLE_COMPARISON_AFTER")} value={entry.after} />
        </div>
      </details>
    </li>
  );
}

function DiffValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-caption font-medium text-label-secondary">{label}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/55 px-2.5 py-2 font-mono text-caption leading-5 text-label-primary">
        {formatDiffValue(value)}
      </pre>
    </div>
  );
}

function formatDiffValue(value: unknown) {
  if (value === undefined || value === null) return "—";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
