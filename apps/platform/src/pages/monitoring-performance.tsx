import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { formatDateTime, formatDuration, formatNumber, formatPercent } from "@/monitoring/format";
import type { MonitoringPerformanceSearch } from "@/routes/_authenticated/monitoring/performance";
import { SavedViewsControl } from "@/saved-views/saved-views-control";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import { listRequestGroups } from "@/monitoring/monitoring-api";
import {
  MonitoringPage,
  MonitoringQueryState,
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

export function MonitoringPerformancePage(props: {
  search: MonitoringPerformanceSearch;
  onSearchChange: (search: MonitoringPerformanceSearch) => void;
}) {
  const { t } = useTranslation("monitoring");
  const search = props.search.q ?? "";
  const ordering = props.search.ordering ?? "-requests";
  const update = (next: Partial<MonitoringPerformanceSearch>) =>
    props.onSearchChange({ ...props.search, ...next });
  const savedState: SavedViewState = {
    ...SAVED_VIEW_DEFINITIONS.monitoringPerformance.defaultState,
    filters: [],
    ordering: { code: ordering.replace(/^-/, ""), direction: "desc" },
  };
  const applySavedView = (state: SavedViewState) =>
    props.onSearchChange({
      q: undefined,
      ordering: `-${state.ordering.code}` as MonitoringPerformanceSearch["ordering"],
    });
  const load = useCallback(
    () =>
      listRequestGroups({
        days: 30,
        page: 1,
        size: 50,
        q: search || null,
        ordering: ordering as
          | "-requests"
          | "-error_rate"
          | "-p95_latency_ms"
          | "-p99_latency_ms"
          | "-avg_latency_ms"
          | "-last_seen_at",
      }),
    [ordering, search],
  );
  const { state, retry } = useMonitoringQuery(load, [ordering, search]);
  return (
    <MonitoringPage description={t("PERFORMANCE_DESCRIPTION")} title={t("PERFORMANCE_TITLE")}>
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-3">
        <Input
          aria-label={t("SEARCH")}
          className="min-w-52 flex-1"
          onChange={(event) => update({ q: event.target.value || undefined })}
          placeholder={t("PERFORMANCE_SEARCH_PLACEHOLDER")}
          value={search}
        />
        <Select
          onValueChange={(value) =>
            update({ ordering: value as MonitoringPerformanceSearch["ordering"] })
          }
          value={ordering}
        >
          <SelectTrigger aria-label={t("ORDER")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-requests">{t("REQUEST_VOLUME")}</SelectItem>
            <SelectItem value="-error_rate">{t("ERROR_RATE")}</SelectItem>
            <SelectItem value="-p95_latency_ms">P95</SelectItem>
            <SelectItem value="-p99_latency_ms">P99</SelectItem>
            <SelectItem value="-avg_latency_ms">{t("AVERAGE_LATENCY")}</SelectItem>
            <SelectItem value="-last_seen_at">{t("MOST_RECENT")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SavedViewsControl
        definition={SAVED_VIEW_DEFINITIONS.monitoringPerformance}
        onApply={applySavedView}
        state={savedState}
      />
      <MonitoringQueryState
        filtered={Boolean(search || ordering !== "-requests")}
        isEmpty={(data) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("REQUEST")}</TableHead>
                <TableHead>{t("REQUESTS")}</TableHead>
                <TableHead>{t("ERROR_RATE")}</TableHead>
                <TableHead>{t("AVERAGE_LATENCY")}</TableHead>
                <TableHead>P95</TableHead>
                <TableHead>P99</TableHead>
                <TableHead>{t("LAST_SEEN")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items?.map((item) => (
                <TableRow key={`${item.method}:${item.routeTemplate}:${item.statusClass}`}>
                  <TableCell>
                    <span className="font-medium">{item.method}</span>
                    <span className="ml-2 font-mono text-caption">{item.routeTemplate}</span>
                  </TableCell>
                  <TableCell>{formatNumber(item.requests)}</TableCell>
                  <TableCell>{formatPercent(item.errorRate)}</TableCell>
                  <TableCell>{formatDuration(item.avgLatencyMs)}</TableCell>
                  <TableCell>
                    {item.p95LatencyMs == null
                      ? t("UNAVAILABLE")
                      : formatDuration(item.p95LatencyMs)}
                  </TableCell>
                  <TableCell>
                    {item.p99LatencyMs == null
                      ? t("UNAVAILABLE")
                      : formatDuration(item.p99LatencyMs)}
                  </TableCell>
                  <TableCell>{formatDateTime(item.lastSeenAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </MonitoringQueryState>
    </MonitoringPage>
  );
}
