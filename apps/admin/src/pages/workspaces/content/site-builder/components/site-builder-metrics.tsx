type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

export function SiteBuilderMetrics(props: {
  draftCount: number;
  globalCount: number;
  nodeCount: number;
  publishedCount: number;
  routeCount: number;
  t: TranslationFn;
}) {
  const metrics = [
    { label: props.t("content_library:SITE_BUILDER_PAGES_TITLE"), value: props.nodeCount },
    {
      label: props.t("content_library:SITE_BUILDER_METRIC_PUBLISHED"),
      value: props.publishedCount,
    },
    { label: props.t("content_library:SITE_BUILDER_METRIC_DRAFT"), value: props.draftCount },
    { label: props.t("content_library:SITE_BUILDER_GLOBALS_TITLE"), value: props.globalCount },
    { label: props.t("content_library:SITE_BUILDER_METRIC_ROUTES"), value: props.routeCount },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="text-footnote text-label-secondary">{metric.label}</div>
          <div className="mt-2 text-title1 text-foreground">{metric.value}</div>
        </div>
      ))}
    </div>
  );
}
