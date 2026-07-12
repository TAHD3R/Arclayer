import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@arclayer/ui/card";

export function ObservabilityMetricCard(props: {
  label: string;
  value: string;
  icon: LucideIcon;
  description?: string;
}) {
  const Icon = props.icon;

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between gap-4 pb-3">
        <CardTitle className="text-footnote text-label-secondary">{props.label}</CardTitle>
        <Icon aria-hidden="true" className="size-4 shrink-0 text-label-secondary" />
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="truncate font-mono text-title2 font-semibold tabular-nums text-label-primary">
          {props.value}
        </div>
        {props.description ? (
          <p className="text-footnote text-label-secondary">{props.description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ObservabilityMetricSection(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={props.title}>
      <h2 className="text-title3 font-semibold text-label-primary">{props.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{props.children}</div>
    </section>
  );
}
