import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { listTenantProjects, listTenantWorkspaces } from "@/api/tenant-directory";
import {
  formatCostMicros,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/monitoring/format";
import {
  getActivityTrend,
  getAiRuntimeHealth,
  getObservabilityOverview,
  listAiUsageGroups,
  listAiUsageRecords,
} from "@/monitoring/monitoring-api";
import type { ObservabilityOverviewOut, ObservabilityTrendOut } from "@arclayer/platform-openapi";
import {
  MonitoringPage,
  MonitoringQueryState,
  MonitoringToolbar,
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import type { MonitoringAiUsageSearch } from "@/routes/_authenticated/monitoring/ai-usage";
import { SavedViewsControl } from "@/saved-views/saved-views-control";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 50;
const DIRECTORY_PAGE_SIZE = 100;

const AI_TREND_METRICS = ["requests", "errors", "tokens", "cost"] as const;
type AiTrendMetric = (typeof AI_TREND_METRICS)[number];
type AiUsageDashboardData = Readonly<{
  groups: Awaited<ReturnType<typeof listAiUsageGroups>>;
  records: Awaited<ReturnType<typeof listAiUsageRecords>>;
  overview: ObservabilityOverviewOut;
  runtimeHealth: Awaited<ReturnType<typeof getAiRuntimeHealth>>;
  trends: Readonly<Record<AiTrendMetric, ObservabilityTrendOut>>;
}>;

type DirectoryOption = Readonly<{ id: string; label: string }>;

async function loadWorkspaceOptions(): Promise<DirectoryOption[]> {
  const options: DirectoryOption[] = [];
  let page = 1;
  while (true) {
    const result = await listTenantWorkspaces({
      page,
      size: DIRECTORY_PAGE_SIZE,
      ordering: "name",
      is_archived: false,
    });
    options.push(
      ...(result.items ?? []).map((item) => ({ id: item.workspaceId, label: item.name })),
    );
    if (!result.next) return options;
    page = result.next;
  }
}

async function loadProjectOptions(workspaceId: string): Promise<DirectoryOption[]> {
  const options: DirectoryOption[] = [];
  let page = 1;
  while (true) {
    const result = await listTenantProjects({
      page,
      size: DIRECTORY_PAGE_SIZE,
      ordering: "name",
      workspace_id: workspaceId || null,
    });
    options.push(...(result.items ?? []).map((item) => ({ id: item.projectId, label: item.name })));
    if (!result.next) return options;
    page = result.next;
  }
}

function savedFilterValue(state: SavedViewState, code: string): unknown {
  return state.filters.find((item) => item.code === code)?.value;
}

export function createMonitoringAiUsageSavedState(search: MonitoringAiUsageSearch): SavedViewState {
  const days = search.days ?? 30;
  const provider = search.provider ?? "";
  const workspaceId = search.workspaceId ?? "";
  const projectId = search.projectId ?? "";
  const startDate = search.startDate ?? "";
  const endDate = search.endDate ?? "";

  return {
    ...SAVED_VIEW_DEFINITIONS.monitoringAiUsage.defaultState,
    filters: [
      ...(days === 30 ? [] : [{ code: "days", value: days }]),
      ...(provider ? [{ code: "provider", value: provider }] : []),
      ...(workspaceId ? [{ code: "workspace_id", value: workspaceId }] : []),
      ...(projectId ? [{ code: "project_id", value: projectId }] : []),
      ...(startDate ? [{ code: "start_date", value: startDate }] : []),
      ...(endDate ? [{ code: "end_date", value: endDate }] : []),
      ...(search.status ? [{ code: "status", value: search.status }] : []),
      ...(search.source ? [{ code: "source", value: search.source }] : []),
      ...(search.errorCode ? [{ code: "error_code", value: search.errorCode }] : []),
    ],
  };
}

export function MonitoringAiUsagePage(props: {
  search: MonitoringAiUsageSearch;
  onSearchChange: (search: MonitoringAiUsageSearch) => void;
}) {
  const { t } = useTranslation("monitoring");
  const search = props.search.q ?? "";
  const provider = props.search.provider ?? "";
  const workspaceId = props.search.workspaceId ?? "";
  const projectId = props.search.projectId ?? "";
  const startDate = props.search.startDate ?? "";
  const endDate = props.search.endDate ?? "";
  const status = props.search.status ?? "";
  const source = props.search.source ?? "";
  const errorCode = props.search.errorCode ?? "";
  const days = props.search.days ?? 30;
  const page = props.search.page ?? 1;
  const update = (next: Partial<MonitoringAiUsageSearch>) =>
    props.onSearchChange({ ...props.search, ...next, page: next.page ?? 1 });
  const savedState = createMonitoringAiUsageSavedState(props.search);
  const loadWorkspaces = useCallback(loadWorkspaceOptions, []);
  const loadProjects = useCallback(() => loadProjectOptions(workspaceId), [workspaceId]);
  const workspaceOptions = useMonitoringQuery(loadWorkspaces, []);
  const projectOptions = useMonitoringQuery(loadProjects, [workspaceId]);
  const applySavedView = (state: SavedViewState) => {
    const savedDays = savedFilterValue(state, "days");
    const savedProvider = savedFilterValue(state, "provider");
    const savedWorkspaceId = savedFilterValue(state, "workspace_id");
    const savedProjectId = savedFilterValue(state, "project_id");
    const savedStartDate = savedFilterValue(state, "start_date");
    const savedEndDate = savedFilterValue(state, "end_date");
    const savedStatus = savedFilterValue(state, "status");
    const savedSource = savedFilterValue(state, "source");
    const savedErrorCode = savedFilterValue(state, "error_code");
    props.onSearchChange({
      q: undefined,
      page: 1,
      days: savedDays === 7 || savedDays === 30 || savedDays === 90 ? savedDays : undefined,
      provider: typeof savedProvider === "string" ? savedProvider : undefined,
      workspaceId: typeof savedWorkspaceId === "string" ? savedWorkspaceId : undefined,
      projectId: typeof savedProjectId === "string" ? savedProjectId : undefined,
      startDate: typeof savedStartDate === "string" ? savedStartDate : undefined,
      endDate: typeof savedEndDate === "string" ? savedEndDate : undefined,
      status: typeof savedStatus === "string" ? savedStatus : undefined,
      source: typeof savedSource === "string" ? savedSource : undefined,
      errorCode: typeof savedErrorCode === "string" ? savedErrorCode : undefined,
    });
  };
  const dateRangeValid = Boolean(startDate && endDate && endDate >= startDate);
  const hasPartialDateRange = Boolean(startDate || endDate) && !dateRangeValid;
  const load = useCallback(async (): Promise<AiUsageDashboardData> => {
    const query = {
      days,
      startDate: dateRangeValid ? startDate : null,
      endDate: dateRangeValid ? endDate : null,
      page,
      size: PAGE_SIZE,
      q: search || null,
      provider: provider || null,
      workspaceId: workspaceId || null,
      projectId: projectId || null,
      status: status || null,
      source: source || null,
      errorCode: errorCode || null,
    };
    const [groups, records, overview, runtimeHealth, ...trendResults] = await Promise.all([
      listAiUsageGroups(query),
      listAiUsageRecords(query),
      getObservabilityOverview({
        days,
        startDate: dateRangeValid ? startDate : null,
        endDate: dateRangeValid ? endDate : null,
        workspaceId: workspaceId || null,
        projectId: projectId || null,
      }),
      getAiRuntimeHealth(),
      ...AI_TREND_METRICS.map((metric) =>
        getActivityTrend({
          days,
          startDate: dateRangeValid ? startDate : null,
          endDate: dateRangeValid ? endDate : null,
          metric,
          workspaceId: workspaceId || null,
          projectId: projectId || null,
        }),
      ),
    ]);
    return {
      groups,
      records,
      overview,
      runtimeHealth,
      trends: Object.fromEntries(
        AI_TREND_METRICS.map((metric, index) => [metric, trendResults[index]]),
      ) as Record<AiTrendMetric, ObservabilityTrendOut>,
    };
  }, [
    dateRangeValid,
    days,
    endDate,
    errorCode,
    page,
    projectId,
    provider,
    search,
    source,
    startDate,
    status,
    workspaceId,
  ]);
  const { state, retry } = useMonitoringQuery(load, [
    days,
    endDate,
    errorCode,
    page,
    projectId,
    provider,
    search,
    workspaceId,
    source,
    startDate,
    status,
  ]);
  const directoryError =
    workspaceOptions.state.status === "error" || projectOptions.state.status === "error";
  const providerOptions =
    state.status === "ready" ? state.data.runtimeHealth.providerReadiness.items : [];
  return (
    <MonitoringPage description={t("AI_USAGE_DESCRIPTION")} title={t("AI_USAGE_TITLE")}>
      <MonitoringToolbar
        filters={
          <>
            <Input
              aria-label={t("SEARCH")}
              className="min-w-52 flex-1"
              onChange={(event) => update({ q: event.target.value || undefined })}
              placeholder={t("AI_USAGE_SEARCH_PLACEHOLDER")}
              value={search}
            />
            <Select
              onValueChange={(value) => update({ provider: value === "all" ? undefined : value })}
              value={provider || "all"}
            >
              <SelectTrigger aria-label={t("PROVIDER")} className="w-full sm:w-52">
                <SelectValue placeholder={t("ALL_PROVIDERS")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ALL_PROVIDERS")}</SelectItem>
                {providerOptions.map((option) => (
                  <SelectItem key={option.provider} value={option.provider}>
                    <span className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.defaultModel} ·{" "}
                        {t(option.routable ? "PROVIDER_READY" : "PROVIDER_NOT_READY")}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => update({ status: value === "all" ? undefined : value })}
              value={status || "all"}
            >
              <SelectTrigger aria-label={t("STATUS")} className="w-full sm:w-40">
                <SelectValue placeholder={t("ALL_STATUSES")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ALL_STATUSES")}</SelectItem>
                <SelectItem value="success">success</SelectItem>
                <SelectItem value="error">error</SelectItem>
                <SelectItem value="rate_limited">rate_limited</SelectItem>
                <SelectItem value="cancelled">cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => update({ source: value === "all" ? undefined : value })}
              value={source || "all"}
            >
              <SelectTrigger aria-label={t("ALL_SOURCES")} className="w-full sm:w-36">
                <SelectValue placeholder={t("ALL_SOURCES")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ALL_SOURCES")}</SelectItem>
                <SelectItem value="agent">{t("AI_SOURCE_AGENT")}</SelectItem>
                <SelectItem value="event">{t("AI_SOURCE_EVENT")}</SelectItem>
                <SelectItem value="api">{t("AI_SOURCE_API")}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              aria-label={t("ALL_ERROR_CODES")}
              className="min-w-40"
              onChange={(event) => update({ errorCode: event.target.value || undefined })}
              placeholder={t("ALL_ERROR_CODES")}
              value={errorCode}
            />
            <Select
              disabled={workspaceOptions.state.status !== "ready"}
              onValueChange={(value) =>
                update({ workspaceId: value === "all" ? undefined : value, projectId: undefined })
              }
              value={workspaceId || "all"}
            >
              <SelectTrigger aria-label={t("WORKSPACE")} className="w-full sm:w-48">
                <SelectValue placeholder={t("ALL_WORKSPACES")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ALL_WORKSPACES")}</SelectItem>
                {workspaceOptions.state.status === "ready"
                  ? workspaceOptions.state.data.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))
                  : null}
                {workspaceId &&
                workspaceOptions.state.status === "ready" &&
                !workspaceOptions.state.data.some((option) => option.id === workspaceId) ? (
                  <SelectItem value={workspaceId}>{t("SELECTION_UNAVAILABLE")}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <Input
              aria-label={t("AI_USAGE_START_DATE")}
              className="w-full sm:w-40"
              onChange={(event) => update({ startDate: event.target.value || undefined })}
              placeholder={t("AI_USAGE_START_DATE")}
              type="date"
              value={startDate}
            />
            <Input
              aria-label={t("AI_USAGE_END_DATE")}
              className="w-full sm:w-40"
              onChange={(event) => update({ endDate: event.target.value || undefined })}
              placeholder={t("AI_USAGE_END_DATE")}
              type="date"
              value={endDate}
            />
            <Select
              disabled={projectOptions.state.status !== "ready"}
              onValueChange={(value) => update({ projectId: value === "all" ? undefined : value })}
              value={projectId || "all"}
            >
              <SelectTrigger aria-label={t("PROJECT")} className="w-full sm:w-48">
                <SelectValue placeholder={t("ALL_PROJECTS")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ALL_PROJECTS")}</SelectItem>
                {projectOptions.state.status === "ready"
                  ? projectOptions.state.data.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))
                  : null}
                {projectId &&
                projectOptions.state.status === "ready" &&
                !projectOptions.state.data.some((option) => option.id === projectId) ? (
                  <SelectItem value={projectId}>{t("SELECTION_UNAVAILABLE")}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => update({ days: Number(value) as 7 | 30 | 90 })}
              value={String(days)}
            >
              <SelectTrigger aria-label={t("PERIOD")} className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("DAYS", { count: 7 })}</SelectItem>
                <SelectItem value="30">{t("DAYS", { count: 30 })}</SelectItem>
                <SelectItem value="90">{t("DAYS", { count: 90 })}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        savedViews={
          <SavedViewsControl
            definition={SAVED_VIEW_DEFINITIONS.monitoringAiUsage}
            onApply={applySavedView}
            state={savedState}
          />
        }
        warning={
          directoryError || hasPartialDateRange ? (
            <div className="space-y-2">
              {hasPartialDateRange ? (
                <Alert variant="destructive">
                  <AlertTitle>{t("AI_USAGE_DATE_RANGE_ERROR")}</AlertTitle>
                </Alert>
              ) : null}
              {directoryError ? (
                <Alert variant="destructive">
                  <AlertTitle>{t("FILTER_OPTIONS_ERROR_TITLE")}</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                    <span>{t("FILTER_OPTIONS_ERROR_DESCRIPTION")}</span>
                    <Button
                      onClick={() => {
                        workspaceOptions.retry();
                        projectOptions.retry();
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {t("RETRY")}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : undefined
        }
      />
      <MonitoringQueryState
        filtered={Boolean(
          search ||
          provider ||
          workspaceId ||
          projectId ||
          status ||
          source ||
          errorCode ||
          startDate ||
          endDate ||
          days !== 30,
        )}
        isEmpty={(data) => !data.groups.items?.length}
        retry={retry}
        state={state}
      >
        {(dashboard) => {
          const data = dashboard.groups;
          const requests = dashboard.overview.ai.requests;
          const errors = dashboard.overview.ai.errorRequests;
          const tokens = dashboard.overview.ai.totalTokens;
          const cost = dashboard.overview.ai.costMicros;
          return (
            <>
              <section aria-label={t("AI_RUNTIME_HEALTH")} className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{t("AI_RUNTIME_HEALTH")}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t("AI_RUNTIME_HEALTH_DESCRIPTION")}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t("MEASURED_AT", {
                      value: formatDateTime(dashboard.runtimeHealth.measuredAt),
                    })}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <MetricCard
                    label={t("CURRENT_RUNS")}
                    value={formatNumber(dashboard.runtimeHealth.currentRuns)}
                  />
                  <MetricCard
                    label={t("WAITING_RUNS")}
                    value={formatNumber(dashboard.runtimeHealth.waitingRuns)}
                  />
                  <MetricCard
                    label={t("FAILED_RUNS")}
                    value={formatNumber(dashboard.runtimeHealth.failedRuns)}
                  />
                  <MetricCard
                    label={t("QUEUED_JOBS")}
                    value={formatNumber(dashboard.runtimeHealth.queuedJobs)}
                  />
                  <MetricCard
                    label={t("QUEUE_LATENCY")}
                    value={
                      dashboard.runtimeHealth.queueLatencyMs === null
                        ? t("NOT_AVAILABLE")
                        : formatDuration(dashboard.runtimeHealth.queueLatencyMs)
                    }
                  />
                </div>
              </section>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label={t("REQUESTS")} value={formatNumber(requests)} />
                <MetricCard
                  label={t("ERRORS")}
                  value={`${formatNumber(errors)} · ${formatPercent(requests ? errors / requests : 0)}`}
                />
                <MetricCard label={t("TOKENS")} value={formatNumber(tokens)} />
                <MetricCard label={t("COST")} value={formatCostMicros(cost)} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {AI_TREND_METRICS.map((metric) => (
                  <TrendCard key={metric} metric={metric} trend={dashboard.trends[metric]} />
                ))}
              </div>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">{t("MODEL")}</TableHead>
                    <TableHead className="w-[14%]">{t("REQUESTS")}</TableHead>
                    <TableHead className="w-[15%]">{t("ERROR_RATE")}</TableHead>
                    <TableHead className="w-[23%]">{t("CONSUMPTION")}</TableHead>
                    <TableHead className="w-[20%]">{t("PERFORMANCE")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={`${item.provider}:${item.model}`}>
                      <TableCell>
                        <span className="font-medium">{item.model}</span>
                        <span className="ml-2 text-muted-foreground">{item.provider}</span>
                      </TableCell>
                      <TableCell>{formatNumber(item.requests)}</TableCell>
                      <TableCell>{formatPercent(item.errorRate)}</TableCell>
                      <TableCell>
                        <span className="block">
                          {formatNumber(item.totalTokens)} {t("TOKENS")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatCostMicros(item.costMicros)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block">{formatDuration(item.avgLatencyMs)}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("LAST_SEEN_SHORT", { value: formatDateTime(item.lastSeenAt) })}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {t("PAGE_OF", { page: data.page, pages: data.pages, total: data.total })}
                </span>
                <div className="flex gap-2">
                  <Button
                    disabled={!data.prev}
                    onClick={() => update({ page: data.prev ?? page })}
                    size="sm"
                    variant="outline"
                  >
                    {t("PREVIOUS")}
                  </Button>
                  <Button
                    disabled={!data.next}
                    onClick={() => update({ page: data.next ?? page })}
                    size="sm"
                    variant="outline"
                  >
                    {t("NEXT")}
                  </Button>
                </div>
              </div>
              <section className="space-y-3" aria-label={t("AI_USAGE_RECORDS_TITLE")}>
                <div>
                  <h2 className="text-lg font-semibold">{t("AI_USAGE_RECORDS_TITLE")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("AI_USAGE_RECORDS_DESCRIPTION")}
                  </p>
                </div>
                {dashboard.records.items?.length ? (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("MODEL")}</TableHead>
                        <TableHead>{t("STATUS")}</TableHead>
                        <TableHead>{t("ALL_SOURCES")}</TableHead>
                        <TableHead>{t("REQUEST_TYPE")}</TableHead>
                        <TableHead>{t("CONSUMPTION")}</TableHead>
                        <TableHead>{t("CORRELATION")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.records.items.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <span className="font-medium">{record.model}</span>
                            <span className="ml-2 text-muted-foreground">{record.provider}</span>
                          </TableCell>
                          <TableCell>{record.status}</TableCell>
                          <TableCell>{record.source}</TableCell>
                          <TableCell>{record.requestType}</TableCell>
                          <TableCell>
                            <span className="block">
                              {formatNumber(record.totalTokens)} {t("TOKENS")}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatCostMicros(record.costMicros)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-48 truncate font-mono text-xs">
                            {record.correlationId}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="rounded-md border p-4 text-sm text-muted-foreground">
                    {t("NO_TASK_RECORDS")}
                  </p>
                )}
              </section>
            </>
          );
        }}
      </MonitoringQueryState>
    </MonitoringPage>
  );
}

function MetricCard(props: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{props.value}</p>
    </div>
  );
}

function TrendCard(props: Readonly<{ metric: AiTrendMetric; trend: ObservabilityTrendOut }>) {
  const { t } = useTranslation("monitoring");
  const max = Math.max(...props.trend.points.map((point) => Number(point.value)), 1);
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{t(`AI_TREND_${props.metric.toUpperCase()}`)}</p>
        <span className="text-sm text-muted-foreground">
          {formatNumber(Number(props.trend.total))}
        </span>
      </div>
      <div
        className="mt-4 flex h-24 items-end gap-1"
        aria-label={t(`AI_TREND_${props.metric.toUpperCase()}`)}
      >
        {props.trend.points.map((point) => (
          <div
            className="min-w-1 flex-1 rounded-sm bg-primary/70"
            key={point.date}
            style={{ height: `${Math.max((Number(point.value) / max) * 100, 4)}%` }}
            title={`${point.date}: ${point.value}`}
          />
        ))}
      </div>
    </div>
  );
}
