import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { formatDateTime, formatDuration, formatNumber, formatPercent } from "@/monitoring/format";
import { presentRequest } from "@/monitoring/monitoring-presentation";
import type { MonitoringPerformanceSearch } from "@/routes/_authenticated/monitoring/performance";
import { SavedViewsControl } from "@/saved-views/saved-views-control";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import { listRequestGroups } from "@/monitoring/monitoring-api";
import {
  MonitoringPage,
  MonitoringQueryState,
  MonitoringToolbar,
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
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
      <MonitoringToolbar
        filters={
          <>
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
              <SelectTrigger aria-label={t("ORDER")} className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-requests">{t("REQUEST_VOLUME")}</SelectItem>
                <SelectItem value="-error_rate">{t("ERROR_RATE")}</SelectItem>
                <SelectItem value="-p95_latency_ms">{t("P95_LATENCY")}</SelectItem>
                <SelectItem value="-p99_latency_ms">{t("P99_LATENCY")}</SelectItem>
                <SelectItem value="-avg_latency_ms">{t("AVERAGE_LATENCY")}</SelectItem>
                <SelectItem value="-last_seen_at">{t("MOST_RECENT")}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        savedViews={
          <SavedViewsControl
            definition={SAVED_VIEW_DEFINITIONS.monitoringPerformance}
            onApply={applySavedView}
            state={savedState}
          />
        }
      />
      <MonitoringQueryState
        filtered={Boolean(search || ordering !== "-requests")}
        isEmpty={(data) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[34%]">{t("SERVICE")}</TableHead>
                <TableHead className="w-[14%]">{t("REQUESTS")}</TableHead>
                <TableHead className="w-[14%]">{t("ERROR_RATE")}</TableHead>
                <TableHead className="w-[24%]">{t("LATENCY")}</TableHead>
                <TableHead className="hidden w-[14%] lg:table-cell">{t("LAST_SEEN")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items?.map((item) => (
                <TableRow key={`${item.method}:${item.routeTemplate}:${item.statusClass}`}>
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline">{item.method}</Badge>
                      <span className="truncate font-medium">
                        {t(presentRequest(item.method, item.routeTemplate).areaKey)}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-caption text-label-secondary">
                      {t(presentRequest(item.method, item.routeTemplate).actionKey)}
                    </span>
                  </TableCell>
                  <TableCell>{formatNumber(item.requests)}</TableCell>
                  <TableCell>{formatPercent(item.errorRate)}</TableCell>
                  <TableCell>
                    <span className="block font-medium">{formatDuration(item.avgLatencyMs)}</span>
                    <span className="text-caption text-label-secondary">
                      {t("LATENCY_PERCENTILES", {
                        p95:
                          item.p95LatencyMs == null
                            ? t("UNAVAILABLE")
                            : formatDuration(item.p95LatencyMs),
                        p99:
                          item.p99LatencyMs == null
                            ? t("UNAVAILABLE")
                            : formatDuration(item.p99LatencyMs),
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatDateTime(item.lastSeenAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </MonitoringQueryState>
    </MonitoringPage>
  );
}
