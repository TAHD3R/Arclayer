import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { OperationalSignalOut, PlatformCapabilityOut } from "@arclayer/platform-openapi";

import { getTrustedCapabilityModule } from "@/capabilities/module-registry";
import { useOperationsQuery } from "@/operations/operations-state";
import { formatAge, formatDateTime } from "@/operations/operations-ui";
import {
  loadPlatformOverview,
  type OverviewSource,
  type PlatformOverview,
} from "@/overview/overview-api";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

function SourceUnavailable({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation("overview");
  return (
    <div className="flex min-h-24 items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <AlertCircle aria-hidden="true" className="size-4 text-warning" />
      <p className="text-footnote text-label-secondary">
        {t("SOURCE_UNAVAILABLE", { source: label })}
      </p>
    </div>
  );
}

function capabilityDestination(capability: PlatformCapabilityOut): string | null {
  const module = getTrustedCapabilityModule(capability.routeTarget);
  const target = capability.navigationTargets[0]?.routeTarget;
  return (
    module?.destinations.find((destination) => destination.routeTarget === target)?.path ?? null
  );
}

function CapabilityStatus({ capability }: Readonly<{ capability: PlatformCapabilityOut }>) {
  const { t } = useTranslation("overview");
  const ready = capability.enablementState === "enabled" && capability.readinessState === "ready";
  const healthKnown = capability.runtimeHealth !== "not_reported";
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant={ready ? "secondary" : "outline"}>
        {t(`READINESS_${capability.readinessState.toUpperCase()}`)}
      </Badge>
      <Badge
        variant={
          capability.runtimeHealth === "healthy"
            ? "secondary"
            : capability.runtimeHealth === "degraded" || capability.runtimeHealth === "unavailable"
              ? "destructive"
              : "outline"
        }
      >
        {t(
          healthKnown ? `HEALTH_${capability.runtimeHealth.toUpperCase()}` : "HEALTH_NOT_REPORTED",
        )}
      </Badge>
    </div>
  );
}

function CapabilityRows({ source }: Readonly<{ source: PlatformOverview["catalog"] }>) {
  const { t } = useTranslation(["overview", "navigation"]);
  if (source.status === "error") return <SourceUnavailable label={t("overview:DOMAIN_POSTURE")} />;
  const capabilities = source.data.items.filter((item) => item.navigationCandidate);

  if (capabilities.length === 0) {
    return (
      <p className="rounded-lg border p-4 text-footnote text-label-secondary">
        {t("overview:NO_DOMAINS")}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("overview:DOMAIN")}</TableHead>
            <TableHead>{t("overview:EFFECTIVE_STATE")}</TableHead>
            <TableHead>{t("overview:READINESS_AND_HEALTH")}</TableHead>
            <TableHead className="text-right">{t("overview:NEXT_ACTION")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {capabilities.map((capability) => {
            const destination = capabilityDestination(capability);
            return (
              <TableRow key={capability.capabilityId}>
                <TableCell>
                  <p className="font-medium">{t(capability.nameI18nKey)}</p>
                  {capability.missingPrerequisiteCodes.length > 0 ? (
                    <p className="mt-1 text-caption text-label-secondary">
                      {t("overview:MISSING_PREREQUISITES", {
                        count: capability.missingPrerequisiteCodes.length,
                      })}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {t(`overview:ENABLEMENT_${capability.enablementState.toUpperCase()}`)}
                </TableCell>
                <TableCell>
                  <CapabilityStatus capability={capability} />
                </TableCell>
                <TableCell className="text-right">
                  {destination ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link to={destination}>
                        {t("overview:OPEN_DOMAIN")}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-caption text-label-secondary">
                      {t("overview:NO_DESTINATION")}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SignalList({
  source,
  recovered = false,
}: Readonly<{
  source: OverviewSource<{ items?: OperationalSignalOut[]; total: number }>;
  recovered?: boolean;
}>) {
  const { t } = useTranslation(["overview", "inbox"]);
  if (source.status === "error") {
    return (
      <SourceUnavailable
        label={t(recovered ? "overview:RECENT_RECOVERIES" : "overview:NEEDS_ATTENTION")}
      />
    );
  }
  const items = source.data.items ?? [];
  if (items.length === 0) {
    return (
      <div className="flex min-h-24 items-center gap-3 rounded-lg border bg-card p-4">
        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
        <p className="text-footnote text-label-secondary">
          {t(recovered ? "overview:NO_RECENT_RECOVERIES" : "overview:NO_ATTENTION")}
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {items.map((signal) => (
        <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" key={signal.id}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {recovered ? (
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
              ) : (
                <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
              )}
              <p className="truncate font-medium">{t(signal.copy.titleKey)}</p>
            </div>
            <p className="mt-1 line-clamp-2 text-footnote text-label-secondary">
              {t(signal.copy.impactKey)}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="inline-flex items-center gap-1 text-caption text-label-secondary">
              <Clock3 aria-hidden="true" className="size-3.5" />
              {formatAge(signal.freshness.ageSeconds)}
            </span>
            <Button asChild size="sm" variant="ghost">
              <Link search={{ signalId: signal.id }} to="/attention">
                {t("overview:REVIEW")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function OverviewContent({ data, retry }: Readonly<{ data: PlatformOverview; retry: () => void }>) {
  const { t } = useTranslation("overview");
  const partial = [data.catalog, data.attention, data.recovered].some(
    (source) => source.status === "error",
  );
  return (
    <section className="flex w-full flex-1 flex-col gap-6 px-5 py-6 md:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-title1 font-semibold">{t("PAGE_TITLE")}</h1>
          <p className="mt-1 text-footnote text-label-secondary">
            {t("STATUS_CHECKED", { date: formatDateTime(data.loadedAt) })}
          </p>
        </div>
        <Button onClick={retry} size="sm" variant="outline">
          <RefreshCw aria-hidden="true" />
          {t("REFRESH")}
        </Button>
      </header>

      {partial ? (
        <Alert className="border-warning/40 bg-warning/5">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("PARTIAL_TITLE")}</AlertTitle>
          <AlertDescription>{t("PARTIAL_DESCRIPTION")}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3" aria-labelledby="overview-attention">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-title3 font-semibold" id="overview-attention">
              {t("NEEDS_ATTENTION")}
            </h2>
            <p className="text-footnote text-label-secondary">{t("NEEDS_ATTENTION_DESCRIPTION")}</p>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link to="/attention">{t("VIEW_ALL")}</Link>
          </Button>
        </div>
        <SignalList source={data.attention} />
      </section>

      <section className="space-y-3" aria-labelledby="overview-domains">
        <div>
          <h2 className="text-title3 font-semibold" id="overview-domains">
            {t("DOMAIN_POSTURE")}
          </h2>
          <p className="text-footnote text-label-secondary">{t("DOMAIN_POSTURE_DESCRIPTION")}</p>
        </div>
        <CapabilityRows source={data.catalog} />
      </section>

      <section className="space-y-3" aria-labelledby="overview-recovered">
        <div>
          <h2 className="text-title3 font-semibold" id="overview-recovered">
            {t("RECENT_RECOVERIES")}
          </h2>
          <p className="text-footnote text-label-secondary">{t("RECENT_RECOVERIES_DESCRIPTION")}</p>
        </div>
        <SignalList recovered source={data.recovered} />
      </section>
    </section>
  );
}

export function PlatformOverviewPage() {
  const { t } = useTranslation("overview");
  const load = useCallback((signal: AbortSignal) => loadPlatformOverview(signal), []);
  const { state, retry } = useOperationsQuery(load, []);

  if (state.status === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label={t("LOADING")}
        aria-live="polite"
        className="space-y-5 px-5 py-6 md:px-8"
        role="status"
      >
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="px-5 py-6 md:px-8">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("ERROR_TITLE")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{t("ERROR_DESCRIPTION")}</p>
            <Button onClick={retry} size="sm" variant="outline">
              {t("RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    );
  }
  return <OverviewContent data={state.data} retry={retry} />;
}
