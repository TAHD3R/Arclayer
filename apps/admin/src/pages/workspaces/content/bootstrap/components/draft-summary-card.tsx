import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

import type { AdminContentItem } from "@/types/api";

export function ContentBootstrapDraftSummaryCard(props: { item: AdminContentItem }) {
  const { t } = useTranslation("content");

  return (
    <Card className="border-primary/30 bg-primary/[0.04] shadow-[0_22px_72px_-52px_rgba(37,99,235,0.45)]">
      <CardHeader className="pb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-label-secondary">
          {t("CONTENT_BOOTSTRAP_DRAFT_SUMMARY_EYEBROW")}
        </div>
        <CardTitle className="text-title3 text-foreground">
          {props.item.title || props.item.slug}
        </CardTitle>
        <CardDescription className="text-callout text-label-secondary">
          {t("CONTENT_BOOTSTRAP_DRAFT_SUMMARY_DESC", { locale: props.item.locale })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-0 text-caption text-label-secondary">
        <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">
          {props.item.slug}
        </span>
        <span className="rounded-full border border-border/70 bg-background px-2.5 py-1">
          {props.item.id}
        </span>
      </CardContent>
    </Card>
  );
}
