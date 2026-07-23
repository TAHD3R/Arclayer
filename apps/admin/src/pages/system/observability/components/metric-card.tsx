import { CalendarRange, Database, Gauge, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@arclayer/ui/card";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";

export type ObservabilityMetricDetail = Readonly<{
  definition: string;
  period: Readonly<{ startDate: string; endDate: string; days: number }>;
  coverage: string;
  interpretation: string;
  source: string;
  relatedFacts: readonly Readonly<{ label: string; value: string }>[];
}>;

export function ObservabilityMetricCard(props: {
  label: string;
  value: string;
  icon: LucideIcon;
  description?: string;
  detail: ObservabilityMetricDetail;
}) {
  const { t, i18n } = useTranslation("platform");
  const [open, setOpen] = useState(false);
  const Icon = props.icon;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const date = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }),
    [locale],
  );
  const periodLabel = t("METRIC_DETAIL_PERIOD_VALUE", {
    start: date.format(new Date(`${props.detail.period.startDate}T00:00:00Z`)),
    end: date.format(new Date(`${props.detail.period.endDate}T00:00:00Z`)),
    days: props.detail.period.days,
  });

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
      <Drawer open={open} onOpenChange={setOpen} direction="right">
        <DrawerContent className="w-full sm:max-w-xl">
          <DrawerHeader className="max-w-none gap-1 px-5 py-4 pr-12">
            <DrawerTitle>{props.label}</DrawerTitle>
            <DrawerDescription>{props.detail.definition}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="max-w-none space-y-6 overflow-y-auto px-5 py-5">
            <section className="rounded-lg border bg-muted/20 p-4">
              <p className="text-caption text-label-tertiary">{props.label}</p>
              <p className="mt-1 font-mono text-title1 font-semibold tabular-nums text-label-primary">
                {props.value}
              </p>
              <div className="mt-3 flex items-center gap-2 text-footnote text-label-secondary">
                <CalendarRange className="size-4 shrink-0" />
                <span>{periodLabel}</span>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2">
                <Gauge className="size-4 text-label-tertiary" />
                <h3 className="text-footnote font-semibold text-label-primary">
                  {t("METRIC_DETAIL_INTERPRETATION")}
                </h3>
              </div>
              <p className="mt-2 text-footnote leading-relaxed text-label-secondary">
                {props.detail.interpretation}
              </p>
            </section>

            <section>
              <h3 className="text-footnote font-semibold text-label-primary">
                {t("METRIC_DETAIL_RELATED_SIGNALS")}
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 rounded-lg border p-4">
                {props.detail.relatedFacts.map((fact) => (
                  <div key={fact.label} className="min-w-0">
                    <dt className="text-caption text-label-tertiary">{fact.label}</dt>
                    <dd className="mt-1 truncate font-mono text-footnote font-medium tabular-nums text-label-primary">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-lg border border-dashed p-4">
              <div className="flex items-start gap-3">
                <Database className="mt-0.5 size-4 shrink-0 text-label-tertiary" />
                <dl className="min-w-0 space-y-3">
                  <div>
                    <dt className="text-caption text-label-tertiary">
                      {t("METRIC_DETAIL_COVERAGE")}
                    </dt>
                    <dd className="mt-1 text-footnote text-label-primary">
                      {props.detail.coverage}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-label-tertiary">
                      {t("METRIC_DETAIL_SOURCE")}
                    </dt>
                    <dd className="mt-1 text-footnote text-label-primary">{props.detail.source}</dd>
                  </div>
                </dl>
              </div>
            </section>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
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
