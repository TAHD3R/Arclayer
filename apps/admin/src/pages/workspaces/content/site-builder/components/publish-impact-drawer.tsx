import { Button, Card, Drawer, Tag } from "antd";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";

import type { SiteBuilderPublishImpact } from "@/api/content/site-builder";
import { ContentGuard } from "@/components/common/content-guard";

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

type PublishImpactMetric = {
  key: "missingRoutes" | "unresolvedRelations" | "unpublishedDependencies";
  label: string;
  count: number;
  items: string[];
};

function buildMetrics(impact: SiteBuilderPublishImpact, t: TranslationFn): PublishImpactMetric[] {
  return [
    {
      key: "missingRoutes",
      label: t("content_library:SITE_BUILDER_PUBLISH_IMPACT_MISSING_ROUTES"),
      count: impact.missingRoutes.length,
      items: impact.missingRoutes,
    },
    {
      key: "unresolvedRelations",
      label: t("content_library:SITE_BUILDER_PUBLISH_IMPACT_UNRESOLVED_RELATIONS"),
      count: impact.unresolvedRelations.length,
      items: impact.unresolvedRelations,
    },
    {
      key: "unpublishedDependencies",
      label: t("content_library:SITE_BUILDER_PUBLISH_IMPACT_UNPUBLISHED_DEPENDENCIES"),
      count: impact.unpublishedDependencies.length,
      items: impact.unpublishedDependencies,
    },
  ];
}

function ImpactMetricTag(props: { metric: PublishImpactMetric }) {
  const label = `${props.metric.label} ${props.metric.count}`;
  return <Tag color={props.metric.count > 0 ? "volcano" : "default"}>{label}</Tag>;
}

function ImpactMetricCard(props: { metric: PublishImpactMetric }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="text-footnote text-label-secondary">{props.metric.label}</div>
      <div className="mt-2 text-title1 text-foreground">{props.metric.count}</div>
    </div>
  );
}

export function PublishImpactDrawer(props: {
  error: unknown;
  impact?: SiteBuilderPublishImpact;
  isLoading: boolean;
  onRetry: () => void;
  t: TranslationFn;
}) {
  const [open, setOpen] = useState(false);
  const metrics = useMemo(
    () => buildMetrics(props.impact ?? EMPTY_IMPACT, props.t),
    [props.impact, props.t],
  );
  const totalBlockers = metrics.reduce((sum, metric) => sum + metric.count, 0);

  return (
    <Card className="border-border shadow-none">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-title2 text-foreground">
            {props.t("content_library:SITE_BUILDER_PUBLISH_IMPACT_TITLE")}
          </div>
          <div className="text-body text-label-secondary">
            {props.t("content_library:SITE_BUILDER_PUBLISH_IMPACT_DESC")}
          </div>
        </div>
        <Button type="text" autoInsertSpace={false} onClick={() => setOpen(true)}>
          {props.t("content_library:SITE_BUILDER_PUBLISH_IMPACT_VIEW_DETAILS")}
        </Button>
      </div>
      <ContentGuard
        loading={props.isLoading}
        error={props.error}
        empty={false}
        onRetry={props.onRetry}
        container="raw"
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="grid gap-3 md:grid-cols-3">
            {metrics.map((metric) => (
              <ImpactMetricCard key={metric.key} metric={metric} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {metrics.map((metric) => (
              <ImpactMetricTag key={metric.key} metric={metric} />
            ))}
          </div>
        </div>
      </ContentGuard>

      {open ? (
        <Drawer
          open
          onClose={() => setOpen(false)}
          title={props.t("content_library:SITE_BUILDER_PUBLISH_IMPACT_TITLE")}
          size="large"
        >
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-callout">
            <AlertTriangle className="size-4 text-label-secondary" />
            <span>
              {props.t("content_library:SITE_BUILDER_PUBLISH_IMPACT_TOTAL", {
                count: totalBlockers,
              })}
            </span>
          </div>
          <div className="grid gap-4">
            {metrics.map((metric) => (
              <div key={metric.key} className="rounded-xl border border-border px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-semibold text-foreground">{metric.label}</div>
                  <Tag color={metric.count > 0 ? "volcano" : "default"}>{metric.count}</Tag>
                </div>
                {metric.items.length ? (
                  <ul className="m-0 list-disc pl-5 text-footnote text-label-secondary">
                    {metric.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-footnote text-label-secondary">
                    {props.t("content_library:SITE_BUILDER_PUBLISH_IMPACT_NONE")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Drawer>
      ) : null}
    </Card>
  );
}

const EMPTY_IMPACT: SiteBuilderPublishImpact = {
  missingRoutes: [],
  unresolvedRelations: [],
  unpublishedDependencies: [],
};
