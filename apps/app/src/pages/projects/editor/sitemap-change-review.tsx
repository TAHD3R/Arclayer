import { Button } from "@arclayer/ui/button";
import type { BuilderChangeSetPreviewOut } from "@arclayer/openapi";
import { AlertTriangle, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";

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
  const blockers = preview.issues.filter((issue) => issue.severity === "blocker");
  return (
    <section
      className="absolute right-4 bottom-4 left-4 z-30 flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.08)]"
      aria-label={t("CREATION_EDITOR_SITEMAP_REVIEW_LABEL")}
      aria-live="polite"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-footnote font-semibold text-label-primary">
            {t("CREATION_EDITOR_SITEMAP_REVIEW_TITLE")}
          </h2>
          <BaseTag icon={lucideTagIcon(preview.approvalClass === "none" ? Check : AlertTriangle)}>
            {t(`CREATION_EDITOR_WIREFRAME_APPROVAL_${preview.approvalClass.toUpperCase()}`)}
          </BaseTag>
        </div>
        <p className="mt-1 truncate text-caption text-label-secondary">
          {t("CREATION_EDITOR_SITEMAP_REVIEW_DESC", { operations: preview.operations.length })}
        </p>
        {blockers.length > 0 ? (
          <p className="mt-2 text-caption text-negative">
            {t("CREATION_EDITOR_SITEMAP_REVIEW_BLOCKERS", { count: blockers.length })}
          </p>
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
