import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HttpRequestRecordOut } from "@arclayer/platform-openapi";

import { formatDateTime, formatDuration } from "@/monitoring/format";
import { presentRequest, requestStatusKey } from "@/monitoring/monitoring-presentation";
import type { MonitoringRequestsSearch } from "@/routes/_authenticated/monitoring/requests";
import { SavedViewsControl } from "@/saved-views/saved-views-control";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import { listRequestRecords } from "@/monitoring/monitoring-api";
import {
  MonitoringPage,
  MonitoringQueryState,
  MonitoringToolbar,
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@arclayer/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

const PAGE_SIZE = 20;

function RequestDetail({
  item,
  onClose,
}: Readonly<{ item: HttpRequestRecordOut; onClose: () => void }>) {
  const { t } = useTranslation("monitoring");
  const presentation = presentRequest(item.method, item.routeTemplate);
  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("REQUEST_DETAIL_TITLE")}</SheetTitle>
          <SheetDescription>
            {t(presentation.areaKey)} · {t(presentation.actionKey)}
          </SheetDescription>
        </SheetHeader>
        <dl className="grid gap-4 px-6 text-footnote sm:grid-cols-2">
          <div>
            <dt className="text-label-secondary">{t("TIME")}</dt>
            <dd>{formatDateTime(item.occurredAt)}</dd>
          </div>
          <div>
            <dt className="text-label-secondary">{t("STATUS")}</dt>
            <dd>
              {t(requestStatusKey(item.statusCode))} · {item.statusCode}
            </dd>
          </div>
          <div>
            <dt className="text-label-secondary">{t("DURATION")}</dt>
            <dd>{formatDuration(item.durationMs)}</dd>
          </div>
          <div>
            <dt className="text-label-secondary">{t("ACTOR")}</dt>
            <dd>{item.actor?.displayName ?? item.actor?.username ?? t("UNAVAILABLE")}</dd>
          </div>
          <div className="border-t pt-4 sm:col-span-2">
            <dt className="font-medium">{t("TECHNICAL_DETAILS")}</dt>
            <dd className="mt-2 grid gap-3 text-label-secondary sm:grid-cols-2">
              <span className="break-all font-mono text-caption">
                {item.method} {item.routeTemplate}
              </span>
              {item.workspaceId ? (
                <span className="break-all font-mono text-caption">
                  {t("WORKSPACE")}: {item.workspaceId}
                </span>
              ) : null}
              {item.projectId ? (
                <span className="break-all font-mono text-caption">
                  {t("PROJECT")}: {item.projectId}
                </span>
              ) : null}
              {item.traceId ? (
                <span className="break-all font-mono text-caption">
                  {t("TRACE")}: {item.traceId}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </SheetContent>
    </Sheet>
  );
}

export function MonitoringRequestsPage(props: {
  search: MonitoringRequestsSearch;
  onSearchChange: (search: MonitoringRequestsSearch) => void;
}) {
  const { t } = useTranslation("monitoring");
  const search = props.search.q ?? "";
  const method = props.search.method ?? "all";
  const ordering = props.search.ordering ?? "-occurred_at";
  const page = props.search.page ?? 1;
  const update = (next: Partial<MonitoringRequestsSearch>) =>
    props.onSearchChange({ ...props.search, ...next, page: next.page ?? 1 });
  const savedState: SavedViewState = {
    ...SAVED_VIEW_DEFINITIONS.monitoringRequests.defaultState,
    filters: method === "all" ? [] : [{ code: "method", value: method }],
    ordering: {
      code: ordering.replace(/^-/, ""),
      direction: ordering.startsWith("-") ? "desc" : "asc",
    },
  };
  const applySavedView = (state: SavedViewState) => {
    const methodValue = state.filters.find((item) => item.code === "method")?.value;
    props.onSearchChange({
      q: undefined,
      page: 1,
      method:
        methodValue === "GET" ||
        methodValue === "POST" ||
        methodValue === "PATCH" ||
        methodValue === "DELETE"
          ? methodValue
          : undefined,
      ordering:
        `${state.ordering.direction === "desc" ? "-" : ""}${state.ordering.code}` as MonitoringRequestsSearch["ordering"],
    });
  };
  const [selected, setSelected] = useState<HttpRequestRecordOut | null>(null);
  const load = useCallback(
    () =>
      listRequestRecords({
        days: 30,
        page,
        size: PAGE_SIZE,
        q: search || null,
        method: method === "all" ? null : method,
        ordering: ordering as
          | "-occurred_at"
          | "occurred_at"
          | "-duration_ms"
          | "duration_ms"
          | "-status_code",
      }),
    [method, ordering, page, search],
  );
  const { state, retry } = useMonitoringQuery(load, [method, ordering, page, search]);
  const filtered = Boolean(search || method !== "all" || ordering !== "-occurred_at");

  return (
    <MonitoringPage description={t("REQUESTS_DESCRIPTION")} title={t("REQUESTS_TITLE")}>
      <MonitoringToolbar
        filters={
          <>
            <Input
              aria-label={t("SEARCH")}
              className="min-w-52 flex-1"
              onChange={(event) => update({ q: event.target.value || undefined })}
              placeholder={t("REQUESTS_SEARCH_PLACEHOLDER")}
              value={search}
            />
            <Select
              onValueChange={(value) =>
                update({
                  method:
                    value === "all" ? undefined : (value as MonitoringRequestsSearch["method"]),
                })
              }
              value={method}
            >
              <SelectTrigger aria-label={t("METHOD")} className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ALL_METHODS")}</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) =>
                update({ ordering: value as MonitoringRequestsSearch["ordering"] })
              }
              value={ordering}
            >
              <SelectTrigger aria-label={t("ORDER")} className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-occurred_at">{t("NEWEST")}</SelectItem>
                <SelectItem value="occurred_at">{t("OLDEST")}</SelectItem>
                <SelectItem value="-duration_ms">{t("SLOWEST")}</SelectItem>
                <SelectItem value="duration_ms">{t("FASTEST")}</SelectItem>
                <SelectItem value="-status_code">{t("STATUS_SEVERITY")}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        savedViews={
          <SavedViewsControl
            definition={SAVED_VIEW_DEFINITIONS.monitoringRequests}
            onApply={applySavedView}
            state={savedState}
          />
        }
      />
      <MonitoringQueryState
        filtered={filtered}
        isEmpty={(data) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("TIME")}</TableHead>
                  <TableHead>{t("REQUEST")}</TableHead>
                  <TableHead>{t("STATUS")}</TableHead>
                  <TableHead>{t("DURATION")}</TableHead>
                  <TableHead>{t("ACTOR")}</TableHead>
                  <TableHead>{t("DETAILS")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDateTime(item.occurredAt)}</TableCell>
                    <TableCell>
                      <span className="block font-medium">
                        {t(presentRequest(item.method, item.routeTemplate).areaKey)}
                      </span>
                      <span className="text-caption text-label-secondary">
                        {t(presentRequest(item.method, item.routeTemplate).actionKey)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.statusCode >= 500 ? "destructive" : "outline"}>
                        {t(requestStatusKey(item.statusCode))} · {item.statusCode}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDuration(item.durationMs)}</TableCell>
                    <TableCell>
                      {item.actor?.displayName ?? item.actor?.username ?? t("UNAVAILABLE")}
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => setSelected(item)} size="sm" variant="ghost">
                        {t("DETAILS")}
                      </Button>
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
      {selected && <RequestDetail item={selected} onClose={() => setSelected(null)} />}
    </MonitoringPage>
  );
}
