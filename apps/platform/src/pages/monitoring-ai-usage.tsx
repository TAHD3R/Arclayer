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
import { listAiUsageGroups } from "@/monitoring/monitoring-api";
import {
  MonitoringPage,
  MonitoringQueryState,
  MonitoringToolbar,
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import type { MonitoringAiUsageSearch } from "@/routes/_authenticated/monitoring/ai-usage";
import { SavedViewsControl } from "@/saved-views/saved-views-control";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

const PAGE_SIZE = 50;
const DIRECTORY_PAGE_SIZE = 100;

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

  return {
    ...SAVED_VIEW_DEFINITIONS.monitoringAiUsage.defaultState,
    filters: [
      ...(days === 30 ? [] : [{ code: "days", value: days }]),
      ...(provider ? [{ code: "provider", value: provider }] : []),
      ...(workspaceId ? [{ code: "workspace_id", value: workspaceId }] : []),
      ...(projectId ? [{ code: "project_id", value: projectId }] : []),
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
    props.onSearchChange({
      q: undefined,
      page: 1,
      days: savedDays === 7 || savedDays === 30 || savedDays === 90 ? savedDays : undefined,
      provider: typeof savedProvider === "string" ? savedProvider : undefined,
      workspaceId: typeof savedWorkspaceId === "string" ? savedWorkspaceId : undefined,
      projectId: typeof savedProjectId === "string" ? savedProjectId : undefined,
    });
  };
  const load = useCallback(
    () =>
      listAiUsageGroups({
        days,
        page,
        size: PAGE_SIZE,
        q: search || null,
        provider: provider || null,
        workspaceId: workspaceId || null,
        projectId: projectId || null,
      }),
    [days, page, projectId, provider, search, workspaceId],
  );
  const { state, retry } = useMonitoringQuery(load, [
    days,
    page,
    projectId,
    provider,
    search,
    workspaceId,
  ]);
  const directoryError =
    workspaceOptions.state.status === "error" || projectOptions.state.status === "error";
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
            <Input
              aria-label={t("PROVIDER")}
              className="w-full sm:w-40"
              onChange={(event) => update({ provider: event.target.value || undefined })}
              placeholder={t("PROVIDER_FILTER")}
              value={provider}
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
          directoryError ? (
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
          ) : undefined
        }
      />
      <MonitoringQueryState
        filtered={Boolean(search || provider || workspaceId || projectId || days !== 30)}
        isEmpty={(data) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <>
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
                      <span className="ml-2 text-label-secondary">{item.provider}</span>
                    </TableCell>
                    <TableCell>{formatNumber(item.requests)}</TableCell>
                    <TableCell>{formatPercent(item.errorRate)}</TableCell>
                    <TableCell>
                      <span className="block">
                        {formatNumber(item.totalTokens)} {t("TOKENS")}
                      </span>
                      <span className="text-caption text-label-secondary">
                        {formatCostMicros(item.costMicros)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block">{formatDuration(item.avgLatencyMs)}</span>
                      <span className="text-caption text-label-secondary">
                        {t("LAST_SEEN_SHORT", { value: formatDateTime(item.lastSeenAt) })}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between text-footnote text-label-secondary">
              <span>{t("PAGE_OF", { page: data.page, pages: data.pages, total: data.total })}</span>
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
          </>
        )}
      </MonitoringQueryState>
    </MonitoringPage>
  );
}
