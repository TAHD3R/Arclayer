import { useQuery } from "@tanstack/react-query";
import { Activity, CircleAlert, Clock3, Network } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { listSystemDirectoryWorkspaces } from "@/api/system-directory";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ActivityDetailDialog } from "@/pages/workspaces/shared/activity/components/activity-detail-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@arclayer/ui/tabs";
import type { ActivityEvent, SystemDirectoryWorkspace } from "@arclayer/openapi/admin-types";

import { AuditEventsTable } from "./audit-events-table";
import { RequestGroupsTable } from "./request-groups-table";
import {
  ObservabilityMetricCard,
  ObservabilityMetricSection,
} from "../observability/components/metric-card";
import { ObservabilityPageControls } from "../observability/components/page-controls";
import type { ObservabilityPeriodDays } from "../observability/components/period-select";
import { ObservabilityTrendCard } from "../observability/components/trend-card";
import { formatInteger, formatLatency, formatPercent } from "../observability/formatters";
import {
  useSystemObservabilityOverview,
  useSystemObservabilityTrend,
} from "../observability/hooks";

async function listAllSystemWorkspaces(): Promise<SystemDirectoryWorkspace[]> {
  const firstPage = await listSystemDirectoryWorkspaces({ page: 1, size: 100, ordering: "name" });
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.pages - 1) }, (_, index) => index + 2).map((page) =>
      listSystemDirectoryWorkspaces({ page, size: 100, ordering: "name" }),
    ),
  );
  return [firstPage, ...remainingPages].flatMap((page) => page.items);
}

export function SystemAuditLogPage() {
  const { t, i18n } = useTranslation(["common", "activity", "platform"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [days, setDays] = useState<ObservabilityPeriodDays>(30);
  const [activeView, setActiveView] = useState("requests");
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const overview = useSystemObservabilityOverview(days);
  const requestTrend = useSystemObservabilityTrend(days, "httpRequests");
  const errorTrend = useSystemObservabilityTrend(days, "httpErrors");
  const eventTrend = useSystemObservabilityTrend(days, "auditEvents");
  const workspacesQuery = useQuery({
    queryKey: ["system", "audit", "workspaces"] as const,
    queryFn: listAllSystemWorkspaces,
    retry: false,
    meta: { silent: true },
  });
  const queries = [overview, requestTrend, errorTrend, eventTrend, workspacesQuery];
  const workspaceLabelById = useMemo(
    () =>
      Object.fromEntries(
        (workspacesQuery.data ?? []).map((workspace) => [workspace.workspaceId, workspace.name]),
      ),
    [workspacesQuery.data],
  );

  return (
    <DefaultPage
      title={t("platform:AUDIT_TITLE")}
      description={t("platform:AUDIT_DESCRIPTION")}
      contentClassName="min-h-0 flex flex-col"
      action={
        <ObservabilityPageControls
          days={days}
          onDaysChange={setDays}
          refreshing={queries.some((query) => query.isFetching)}
          onRefresh={() => void Promise.all(queries.map((query) => query.refetch()))}
        />
      }
    >
      <ContentGuard
        loading={overview.isLoading}
        error={overview.error}
        onRetry={() => void overview.refetch()}
        loadingVariant="form"
      >
        {overview.data ? (
          <Tabs
            value={activeView}
            onValueChange={setActiveView}
            className="flex min-h-0 flex-1 flex-col gap-5 pb-8"
          >
            <TabsList className="self-start" aria-label={t("platform:AUDIT_VIEW_LABEL")}>
              <TabsTrigger value="requests">{t("platform:AUDIT_VIEW_REQUESTS")}</TabsTrigger>
              <TabsTrigger value="events">{t("platform:AUDIT_VIEW_EVENTS")}</TabsTrigger>
            </TabsList>

            <TabsContent value="requests" className="mt-0 flex min-h-0 flex-col gap-5">
              <ObservabilityMetricSection title={t("platform:SECTION_HTTP_RELIABILITY")}>
                <ObservabilityMetricCard
                  label={t("platform:METRIC_HTTP_REQUESTS")}
                  value={formatInteger(overview.data.http.requests, locale)}
                  icon={Network}
                />
                <ObservabilityMetricCard
                  label={t("platform:METRIC_HTTP_ERRORS")}
                  value={formatInteger(overview.data.http.errorRequests, locale)}
                  icon={CircleAlert}
                />
                <ObservabilityMetricCard
                  label={t("platform:METRIC_ERROR_RATE")}
                  value={formatPercent(overview.data.http.errorRate, locale)}
                  icon={Activity}
                />
                <ObservabilityMetricCard
                  label={t("platform:METRIC_HTTP_AVG_LATENCY")}
                  value={formatLatency(overview.data.http.avgLatencyMs, locale)}
                  icon={Clock3}
                />
              </ObservabilityMetricSection>
              <div className="grid gap-4 xl:grid-cols-2">
                <ObservabilityTrendCard
                  title={t("platform:TREND_HTTP_REQUESTS")}
                  description={t(`platform:PERIOD_${days}_DAYS`)}
                  points={requestTrend.data?.points}
                  loading={requestTrend.isLoading}
                  error={requestTrend.error}
                  onRetry={() => void requestTrend.refetch()}
                  valueKind="count"
                />
                <ObservabilityTrendCard
                  title={t("platform:TREND_HTTP_ERRORS")}
                  description={t(`platform:PERIOD_${days}_DAYS`)}
                  points={errorTrend.data?.points}
                  loading={errorTrend.isLoading}
                  error={errorTrend.error}
                  onRetry={() => void errorTrend.refetch()}
                  valueKind="count"
                  color="var(--destructive)"
                />
              </div>
              <section className="flex min-h-[32rem] flex-col">
                <h2 className="mb-3 text-headline font-semibold text-label-primary">
                  {t("platform:AUDIT_REQUEST_TABLE_TITLE")}
                </h2>
                <RequestGroupsTable days={days} />
              </section>
            </TabsContent>

            <TabsContent value="events" className="mt-0 flex min-h-0 flex-col gap-5">
              <div className="grid gap-4 xl:grid-cols-2">
                <ObservabilityTrendCard
                  title={t("platform:TREND_AUDIT_EVENTS")}
                  description={t(`platform:PERIOD_${days}_DAYS`)}
                  points={eventTrend.data?.points}
                  loading={eventTrend.isLoading}
                  error={eventTrend.error}
                  onRetry={() => void eventTrend.refetch()}
                  valueKind="count"
                />
              </div>
              <section className="flex min-h-[32rem] flex-col">
                <h2 className="mb-3 text-headline font-semibold text-label-primary">
                  {t("platform:AUDIT_EVENT_TABLE_TITLE")}
                </h2>
                <AuditEventsTable onSelect={setSelected} />
              </section>
            </TabsContent>
          </Tabs>
        ) : null}
      </ContentGuard>

      <ActivityDetailDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        event={selected}
        workspaceLabelById={workspaceLabelById}
      />
    </DefaultPage>
  );
}
