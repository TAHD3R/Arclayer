import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuditEventOut } from "@arclayer/platform-openapi";

import { formatDateTime } from "@/monitoring/format";
import { getActivityDetail, listActivity } from "@/monitoring/monitoring-api";
import {
  auditEventKey,
  auditOutcomeKey,
  auditSourceKey,
  auditTargetKey,
} from "@/monitoring/monitoring-presentation";
import type { MonitoringAuditSearch } from "@/routes/_authenticated/monitoring/audit";
import { SavedViewsControl } from "@/saved-views/saved-views-control";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
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
import { Skeleton } from "@arclayer/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

function AuditDetail({ eventId, onClose }: Readonly<{ eventId: string; onClose: () => void }>) {
  const { t } = useTranslation("monitoring");
  const load = useCallback(() => getActivityDetail({ event_id: eventId }), [eventId]);
  const { state, retry } = useMonitoringQuery(load, [eventId]);
  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("AUDIT_DETAIL_TITLE")}</SheetTitle>
          <SheetDescription>{t("AUDIT_DETAIL_DESCRIPTION")}</SheetDescription>
        </SheetHeader>
        {state.status === "loading" && <Skeleton className="mx-6 h-48" />}
        {state.status === "error" && (
          <div className="px-6">
            <Button onClick={retry} variant="outline">
              {t("RETRY")}
            </Button>
          </div>
        )}
        {state.status === "ready" && <AuditDetailBody event={state.data} />}
      </SheetContent>
    </Sheet>
  );
}

function AuditDetailBody({ event }: Readonly<{ event: AuditEventOut }>) {
  const { t } = useTranslation("monitoring");
  const outcomeKey = auditOutcomeKey(event);
  const target = event.subject?.displayName ?? event.subject?.username;
  return (
    <dl className="grid gap-4 px-6 text-footnote sm:grid-cols-2">
      <div className="sm:col-span-2">
        <dt className="text-label-secondary">{t("ACTION")}</dt>
        <dd className="font-medium">{t(auditEventKey(event.eventName))}</dd>
      </div>
      <div>
        <dt className="text-label-secondary">{t("TIME")}</dt>
        <dd>{formatDateTime(event.occurredAt)}</dd>
      </div>
      <div>
        <dt className="text-label-secondary">{t("RESULT")}</dt>
        <dd>
          <Badge variant={outcomeKey === "AUDIT_OUTCOME_FAILED" ? "destructive" : "outline"}>
            {t(outcomeKey)}
          </Badge>
        </dd>
      </div>
      <div>
        <dt className="text-label-secondary">{t("ACTOR")}</dt>
        <dd>{event.actor?.displayName ?? event.actor?.username ?? t("UNAVAILABLE")}</dd>
      </div>
      <div>
        <dt className="text-label-secondary">{t("TARGET")}</dt>
        <dd>{target ?? t(auditTargetKey(event.entityType))}</dd>
      </div>
      <div className="border-t pt-4 sm:col-span-2">
        <dt className="sr-only">{t("TECHNICAL_DETAILS")}</dt>
        <dd>
          <details>
            <summary className="cursor-pointer font-medium">{t("TECHNICAL_DETAILS")}</summary>
            <dl className="mt-3 grid gap-3 text-label-secondary sm:grid-cols-2">
              <div>
                <dt>{t("EVENT_CODE")}</dt>
                <dd className="break-all font-mono text-caption">{event.eventName}</dd>
              </div>
              <div>
                <dt>{t("SOURCE")}</dt>
                <dd className="break-all font-mono text-caption">
                  {event.source ?? t("UNAVAILABLE")}
                </dd>
              </div>
              {event.entityType ? (
                <div>
                  <dt>{t("TARGET_TYPE")}</dt>
                  <dd className="break-all font-mono text-caption">{event.entityType}</dd>
                </div>
              ) : null}
              {event.entityId ? (
                <div>
                  <dt>{t("TARGET_ID")}</dt>
                  <dd className="break-all font-mono text-caption">{event.entityId}</dd>
                </div>
              ) : null}
              {event.traceId ? (
                <div className="sm:col-span-2">
                  <dt>{t("TRACE")}</dt>
                  <dd className="break-all font-mono text-caption">{event.traceId}</dd>
                </div>
              ) : null}
            </dl>
          </details>
        </dd>
      </div>
    </dl>
  );
}

function savedStringFilter(state: SavedViewState, code: string): string | undefined {
  const value = state.filters.find((item) => item.code === code)?.value;
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function MonitoringAuditPage(props: {
  search: MonitoringAuditSearch;
  onSearchChange: (search: MonitoringAuditSearch) => void;
}) {
  const { t } = useTranslation("monitoring");
  const eventName = props.search.eventName ?? "";
  const ordering = props.search.ordering ?? "-occurred_at";
  const page = props.search.page ?? 1;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const update = (next: Partial<MonitoringAuditSearch>) =>
    props.onSearchChange({ ...props.search, ...next, page: next.page ?? 1 });
  const savedState: SavedViewState = {
    ...SAVED_VIEW_DEFINITIONS.monitoringAudit.defaultState,
    filters: [
      ...(props.search.occurredFrom
        ? [{ code: "occurred_from", value: props.search.occurredFrom }]
        : []),
      ...(props.search.occurredTo ? [{ code: "occurred_to", value: props.search.occurredTo }] : []),
      ...(props.search.eventName ? [{ code: "event_name", value: props.search.eventName }] : []),
      ...(props.search.workspaceId
        ? [{ code: "workspace_id", value: props.search.workspaceId }]
        : []),
      ...(props.search.projectId ? [{ code: "project_id", value: props.search.projectId }] : []),
      ...(props.search.actorUserId
        ? [{ code: "actor_user_id", value: props.search.actorUserId }]
        : []),
      ...(props.search.subjectUserId
        ? [{ code: "subject_user_id", value: props.search.subjectUserId }]
        : []),
      ...(props.search.entityType ? [{ code: "entity_type", value: props.search.entityType }] : []),
      ...(props.search.entityId ? [{ code: "entity_id", value: props.search.entityId }] : []),
    ],
    ordering: {
      code: "occurred_at",
      direction: ordering === "-occurred_at" ? "desc" : "asc",
    },
  };
  const applySavedView = (state: SavedViewState) => {
    props.onSearchChange({
      occurredFrom: savedStringFilter(state, "occurred_from"),
      occurredTo: savedStringFilter(state, "occurred_to"),
      eventName: savedStringFilter(state, "event_name"),
      workspaceId: savedStringFilter(state, "workspace_id"),
      projectId: savedStringFilter(state, "project_id"),
      actorUserId: savedStringFilter(state, "actor_user_id"),
      subjectUserId: savedStringFilter(state, "subject_user_id"),
      entityType: savedStringFilter(state, "entity_type"),
      entityId: savedStringFilter(state, "entity_id"),
      ordering: state.ordering.direction === "desc" ? "-occurred_at" : "occurred_at",
      page: 1,
    });
  };
  const load = useCallback(
    () =>
      listActivity({
        occurredFrom: props.search.occurredFrom ?? null,
        occurredTo: props.search.occurredTo ?? null,
        eventName: eventName || null,
        workspaceId: props.search.workspaceId ?? null,
        projectId: props.search.projectId ?? null,
        actorUserId: props.search.actorUserId ?? null,
        subjectUserId: props.search.subjectUserId ?? null,
        entityType: props.search.entityType ?? null,
        entityId: props.search.entityId ?? null,
        ordering: ordering as "-occurred_at" | "occurred_at",
        page,
        size: 20,
      }),
    [
      eventName,
      ordering,
      page,
      props.search.actorUserId,
      props.search.entityId,
      props.search.entityType,
      props.search.occurredFrom,
      props.search.occurredTo,
      props.search.projectId,
      props.search.subjectUserId,
      props.search.workspaceId,
    ],
  );
  const { state, retry } = useMonitoringQuery(load, [eventName, ordering, page]);
  const filtered = Boolean(
    eventName ||
    ordering !== "-occurred_at" ||
    props.search.occurredFrom ||
    props.search.occurredTo ||
    props.search.workspaceId ||
    props.search.projectId ||
    props.search.actorUserId ||
    props.search.subjectUserId ||
    props.search.entityType ||
    props.search.entityId,
  );
  return (
    <MonitoringPage description={t("AUDIT_DESCRIPTION")} title={t("AUDIT_TITLE")}>
      <MonitoringToolbar
        filters={
          <>
            <Input
              aria-label={t("SEARCH")}
              className="min-w-52 flex-1"
              onChange={(event) => update({ eventName: event.target.value || undefined })}
              placeholder={t("AUDIT_SEARCH_PLACEHOLDER")}
              value={eventName}
            />
            <Select
              onValueChange={(value) =>
                update({ ordering: value as MonitoringAuditSearch["ordering"] })
              }
              value={ordering}
            >
              <SelectTrigger aria-label={t("ORDER")} className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-occurred_at">{t("NEWEST")}</SelectItem>
                <SelectItem value="occurred_at">{t("OLDEST")}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        savedViews={
          <SavedViewsControl
            definition={SAVED_VIEW_DEFINITIONS.monitoringAudit}
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
                  <TableHead>{t("ACTION")}</TableHead>
                  <TableHead>{t("RESULT")}</TableHead>
                  <TableHead>{t("ACTOR")}</TableHead>
                  <TableHead>{t("TARGET")}</TableHead>
                  <TableHead>{t("DETAILS")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items?.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDateTime(event.occurredAt)}</TableCell>
                    <TableCell>
                      <span className="block font-medium">{t(auditEventKey(event.eventName))}</span>
                      <span className="text-caption text-label-secondary">
                        {t(auditSourceKey(event.source))}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          auditOutcomeKey(event) === "AUDIT_OUTCOME_FAILED"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {t(auditOutcomeKey(event))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {event.actor?.displayName ?? event.actor?.username ?? t("UNAVAILABLE")}
                    </TableCell>
                    <TableCell>
                      {event.subject?.displayName ??
                        event.subject?.username ??
                        t(auditTargetKey(event.entityType))}
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => setSelectedId(event.id)} size="sm" variant="ghost">
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
      {selectedId && <AuditDetail eventId={selectedId} onClose={() => setSelectedId(null)} />}
    </MonitoringPage>
  );
}
