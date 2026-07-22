import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@arclayer/ui/card";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

export function ObservabilityMetricCard(props: {
  label: string;
  value: string;
  icon: LucideIcon;
  description?: string;
  detail?: React.ReactNode;
}) {
  const { t } = useTranslation("platform");
  const [open, setOpen] = useState(false);
  const Icon = props.icon;

  return (
    <>
      <Card
        className="min-w-0 cursor-pointer transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="button"
        tabIndex={0}
        aria-label={t("METRIC_OPEN_DETAIL", { label: props.label })}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          setOpen(true);
        }}
      >
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
      <SettingDialog
        open={open}
        onOpenChange={setOpen}
        title={props.label}
        description={props.description}
        contentClassName="max-w-120"
      >
        {props.detail ?? (
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="text-caption text-label-secondary">{t("METRIC_CURRENT_VALUE")}</div>
            <div className="mt-1 font-mono text-title2 font-semibold tabular-nums text-label-primary">
              {props.value}
            </div>
          </div>
        )}
      </SettingDialog>
    </>
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
