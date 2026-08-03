import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { OperationalSignalOut, PlatformCapabilityOut } from "@arclayer/platform-openapi";

import { getTrustedCapabilityModule } from "@/capabilities/module-registry";
import { PlatformPage, PlatformSection } from "@/components/platform-page";
import { useOperationsQuery } from "@/operations/operations-state";
import { formatAge, formatDateTime } from "@/operations/operations-ui";
import {
  loadPlatformOverview,
  type OverviewSource,
  type PlatformOverview,
} from "@/overview/overview-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function SourceUnavailable({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation("overview");
  return (
    <div className="flex min-h-24 items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <AlertCircle aria-hidden="true" className="size-4 text-amber-600 dark:text-amber-400" />
      <p className="text-sm text-muted-foreground">{t("SOURCE_UNAVAILABLE", { source: label })}</p>
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
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
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
                    <p className="mt-1 text-xs text-muted-foreground">
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
                    <span className="text-xs text-muted-foreground">
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
        <p className="text-sm text-muted-foreground">
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
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {t(signal.copy.impactKey)}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
  const capabilities = data.catalog.status === "ready" ? data.catalog.data.items : [];
  const availableCapabilities = capabilities.filter((item) => item.navigationCandidate);
  const readyCapabilities = availableCapabilities.filter(
    (item) => item.enablementState === "enabled" && item.readinessState === "ready",
  );
  const attentionCount = data.attention.status === "ready" ? data.attention.data.total : null;
  const recoveryCount = data.recovered.status === "ready" ? data.recovered.data.total : null;
  return (
    <PlatformPage
      actions={
        <Button onClick={retry} size="sm" variant="outline">
          <RefreshCw aria-hidden="true" />
          {t("REFRESH")}
        </Button>
      }
      description={t("PAGE_DESCRIPTION", { date: formatDateTime(data.loadedAt) })}
      title={t("PAGE_TITLE")}
    >
      {partial ? (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("PARTIAL_TITLE")}</AlertTitle>
          <AlertDescription>{t("PARTIAL_DESCRIPTION")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <OverviewSummary
          description={t("NEEDS_ATTENTION_DESCRIPTION")}
          href="/attention"
          title={t("NEEDS_ATTENTION")}
          value={attentionCount === null ? t("UNAVAILABLE") : String(attentionCount)}
        />
        <OverviewSummary
          description={t("READY_AREAS_DESCRIPTION", {
            ready: readyCapabilities.length,
            total: availableCapabilities.length,
          })}
          title={t("READY_AREAS")}
          value={`${readyCapabilities.length}/${availableCapabilities.length}`}
        />
        <OverviewSummary
          description={t("RECENT_RECOVERIES_DESCRIPTION")}
          title={t("RECENT_RECOVERIES")}
          value={recoveryCount === null ? t("UNAVAILABLE") : String(recoveryCount)}
        />
      </div>

      <PlatformSection
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link to="/attention">{t("VIEW_ALL")}</Link>
          </Button>
        }
        description={t("NEEDS_ATTENTION_DESCRIPTION")}
        title={t("NEEDS_ATTENTION")}
      >
        <SignalList source={data.attention} />
      </PlatformSection>

      <PlatformSection description={t("DOMAIN_POSTURE_DESCRIPTION")} title={t("DOMAIN_POSTURE")}>
        <CapabilityRows source={data.catalog} />
      </PlatformSection>

      <PlatformSection
        description={t("RECENT_RECOVERIES_DESCRIPTION")}
        title={t("RECENT_RECOVERIES")}
      >
        <SignalList recovered source={data.recovered} />
      </PlatformSection>
    </PlatformPage>
  );
}

function OverviewSummary({
  title,
  description,
  value,
  href,
}: Readonly<{ title: string; description: string; value: string; href?: "/attention" }>) {
  const content = (
    <Card className="h-full shadow-xs transition-colors hover:bg-muted/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="text-sm leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link
      aria-label={title}
      className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
      to={href}
    >
      {content}
    </Link>
  ) : (
    content
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
