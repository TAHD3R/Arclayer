import { useCallback } from "react";
import { useTranslation } from "react-i18next";

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
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import type { MonitoringAiUsageSearch } from "@/routes/_authenticated/monitoring/ai-usage";
import { SavedViewsControl } from "@/saved-views/saved-views-control";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

const PAGE_SIZE = 50;

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
  return (
    <MonitoringPage description={t("AI_USAGE_DESCRIPTION")} title={t("AI_USAGE_TITLE")}>
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-3">
        <Input
          aria-label={t("SEARCH")}
          className="min-w-52 flex-1"
          onChange={(event) => update({ q: event.target.value || undefined })}
          placeholder={t("AI_USAGE_SEARCH_PLACEHOLDER")}
          value={search}
        />
        <Input
          aria-label={t("PROVIDER")}
          onChange={(event) => update({ provider: event.target.value || undefined })}
          placeholder={t("PROVIDER")}
          value={provider}
        />
        <Input
          aria-label={t("WORKSPACE")}
          onChange={(event) => update({ workspaceId: event.target.value || undefined })}
          placeholder={t("WORKSPACE_ID")}
          value={workspaceId}
        />
        <Input
          aria-label={t("PROJECT")}
          onChange={(event) => update({ projectId: event.target.value || undefined })}
          placeholder={t("PROJECT_ID")}
          value={projectId}
        />
        <Select
          onValueChange={(value) => update({ days: Number(value) as 7 | 30 | 90 })}
          value={String(days)}
        >
          <SelectTrigger aria-label={t("PERIOD")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t("DAYS", { count: 7 })}</SelectItem>
            <SelectItem value="30">{t("DAYS", { count: 30 })}</SelectItem>
            <SelectItem value="90">{t("DAYS", { count: 90 })}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SavedViewsControl
        definition={SAVED_VIEW_DEFINITIONS.monitoringAiUsage}
        onApply={applySavedView}
        state={savedState}
      />
      <MonitoringQueryState
        filtered={Boolean(search || provider || workspaceId || projectId || days !== 30)}
        isEmpty={(data) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("MODEL")}</TableHead>
                  <TableHead>{t("REQUESTS")}</TableHead>
                  <TableHead>{t("ERROR_RATE")}</TableHead>
                  <TableHead>{t("TOKENS")}</TableHead>
                  <TableHead>{t("COST")}</TableHead>
                  <TableHead>{t("AVERAGE_LATENCY")}</TableHead>
                  <TableHead>{t("LAST_SEEN")}</TableHead>
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
                    <TableCell>{formatNumber(item.totalTokens)}</TableCell>
                    <TableCell>{formatCostMicros(item.costMicros)}</TableCell>
                    <TableCell>{formatDuration(item.avgLatencyMs)}</TableCell>
                    <TableCell>{formatDateTime(item.lastSeenAt)}</TableCell>
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
