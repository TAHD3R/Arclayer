import { CircleAlert, CircleDashed, ScanSearch, ShieldQuestion } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ProjectDesignSystemImpactEntryOut } from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { getErrorMessage } from "@/lib/notifications";
import { shortStyleGuideHash } from "@/pages/projects/editor/style-guide-format";
import type { ProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";

const IMPACT_REASON_KEYS: Record<ProjectDesignSystemImpactEntryOut["reasonCode"], string> = {
  DESIGN_SYSTEM_TOKEN_CHANGE_REACHES_COMPONENT_RECIPE:
    "CREATION_EDITOR_STYLE_IMPACT_REASON_TOKEN_CHANGE",
  DESIGN_SYSTEM_COMPONENT_RECIPE_CHANGED: "CREATION_EDITOR_STYLE_IMPACT_REASON_RECIPE_CHANGED",
  DESIGN_SYSTEM_COMPONENT_RECIPE_ADDED: "CREATION_EDITOR_STYLE_IMPACT_REASON_RECIPE_ADDED",
  DESIGN_SYSTEM_COMPONENT_RECIPE_REMOVED: "CREATION_EDITOR_STYLE_IMPACT_REASON_RECIPE_REMOVED",
};

export function StyleGuideVersionImpact({
  controller,
}: {
  controller: ProjectStyleGuideController;
}) {
  const { t } = useTranslation("account");
  const history = controller.history;

  if (history.impactQuery.isPending) {
    return (
      <p
        className="mt-5 flex min-h-11 items-center gap-2 border-t border-border pt-5 text-caption text-label-secondary"
        role="status"
      >
        <CircleDashed className="size-4" aria-hidden="true" />
        {t("CREATION_EDITOR_STYLE_IMPACT_LOADING")}
      </p>
    );
  }
  if (history.impactQuery.error) {
    return (
      <div className="mt-5 border-t border-border pt-5" role="alert">
        <p className="border-l border-destructive/40 pl-4 text-caption leading-5 text-label-primary">
          {getErrorMessage(history.impactQuery.error)}
        </p>
        <Button
          className="mt-3 min-h-11 xl:min-h-8"
          size="sm"
          variant="outline"
          onClick={() => void history.impactQuery.refetch()}
        >
          {t("CREATION_EDITOR_STYLE_IMPACT_RETRY")}
        </Button>
      </div>
    );
  }
  if (!history.impact) return null;

  return <ImpactResult impact={history.impact} />;
}

function ImpactResult({
  impact,
}: {
  impact: NonNullable<ProjectStyleGuideController["history"]["impact"]>;
}) {
  const { t } = useTranslation("account");
  const summary = impact.summary;
  return (
    <section
      className="mt-5 border-t border-border pt-5"
      role="region"
      aria-label={t("CREATION_EDITOR_STYLE_IMPACT_LABEL")}
    >
      <h3 className="flex items-center gap-2 text-footnote font-semibold text-label-primary">
        <ScanSearch className="size-4" aria-hidden="true" />
        {t("CREATION_EDITOR_STYLE_IMPACT_TITLE")}
      </h3>
      <p className="mt-1 text-caption leading-5 text-label-secondary">
        {t("CREATION_EDITOR_STYLE_IMPACT_DESC")}
      </p>
      <p className="mt-3 text-caption leading-5 text-label-secondary tabular-nums">
        {t("CREATION_EDITOR_STYLE_IMPACT_SUMMARY", {
          revisions: summary.referencedSiteRevisionCount,
          current: summary.currentSiteRevisionCount,
          pages: summary.affectedPageCount,
          sections: summary.affectedSectionCount,
          warnings: summary.warningCount,
          blockers: summary.blockerCount,
        })}
      </p>
      {summary.assignmentUsesFromVersion ? (
        <p className="mt-2 flex items-center gap-2 text-caption leading-5 text-label-secondary">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {t("CREATION_EDITOR_STYLE_IMPACT_ASSIGNMENT_SOURCE")}
        </p>
      ) : null}
      {impact.impacts.length === 0 ? (
        <p className="mt-3 border-l border-border pl-4 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_STYLE_IMPACT_NO_MAPPED")}
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border border-y border-border">
          {impact.impacts.map((entry) => (
            <ImpactEntry
              key={`${entry.siteRevisionId}:${entry.pageItemId}:${entry.sectionId}:${entry.recipeKey}`}
              entry={entry}
            />
          ))}
        </ol>
      )}
      {summary.unmappedDiffCount > 0 ? (
        <p className="mt-3 text-caption leading-5 text-label-secondary tabular-nums">
          {t("CREATION_EDITOR_STYLE_IMPACT_UNMAPPED", {
            count: summary.unmappedDiffCount,
          })}
        </p>
      ) : null}
      <div className="mt-4 border-l border-border pl-4">
        <p className="flex items-start gap-2 text-caption leading-5 text-label-secondary">
          <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("CREATION_EDITOR_STYLE_IMPACT_ASSET_MANIFEST_ONLY")}
        </p>
        <p className="mt-1 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_STYLE_IMPACT_NOT_EVALUATED")}
        </p>
      </div>
      <p className="mt-3 font-mono text-caption text-label-tertiary tabular-nums">
        {shortStyleGuideHash(impact.impactHash)}
      </p>
    </section>
  );
}

function ImpactEntry({ entry }: { entry: ProjectDesignSystemImpactEntryOut }) {
  const { t } = useTranslation("account");
  return (
    <li className="py-3">
      <p className="flex items-start justify-between gap-3 text-caption font-medium text-label-primary">
        <span>{t(IMPACT_REASON_KEYS[entry.reasonCode])}</span>
        <span className="shrink-0 text-label-secondary">
          {entry.severity === "blocker"
            ? t("CREATION_EDITOR_STYLE_IMPACT_BLOCKER")
            : t("CREATION_EDITOR_STYLE_IMPACT_WARNING")}
        </span>
      </p>
      <p className="mt-1 font-mono text-caption leading-5 text-label-secondary">
        {entry.componentKey} · {entry.variantKey} · {entry.sectionId}
      </p>
      <p className="mt-1 text-caption leading-5 text-label-tertiary">
        {t("CREATION_EDITOR_STYLE_IMPACT_TARGET", {
          revision: entry.revisionNumber,
          page: entry.pageItemId,
        })}
      </p>
      <p className="mt-1 break-all font-mono text-caption leading-5 text-label-tertiary">
        {entry.diffPaths.join(" · ")}
      </p>
    </li>
  );
}
