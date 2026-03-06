import * as React from "react";
import { useTranslation } from "react-i18next";

import type { ActivityEvent } from "@/types/api";
import { SettingDialog } from "@celestial/ui/setting-dialog";
import { formatDateTimeWithPattern } from "@/lib/time/date-time";
import { resolveCatalogEntry } from "@/pages/organization/activity/constants";
import { ActivityUserPill } from "@/pages/organization/activity/components/activity-user-pill";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type ActivityTranslator = (key: string, options?: Record<string, unknown>) => string;

function buildTitle(t: ActivityTranslator, event: ActivityEvent): string {
  const entry = resolveCatalogEntry(event.eventName);
  const rawName = (event.eventName || "").trim() || "-";
  if (!entry) return t("activity:ACTIVITY_EVENT_UNKNOWN_TITLE", { eventName: rawName });
  return t(`activity:${entry.titleKey}`);
}

function buildDescription(t: ActivityTranslator, event: ActivityEvent): string {
  const entry = resolveCatalogEntry(event.eventName);
  const rawName = (event.eventName || "").trim() || "-";
  const parts: string[] = [];
  parts.push(`${t("activity:ACTIVITY_FIELD_EVENT_NAME")}: ${rawName}`);
  if (entry?.descriptionKey) {
    parts.push(t(`activity:${entry.descriptionKey}`));
  } else {
    parts.push(t("activity:ACTIVITY_EVENT_UNKNOWN_DESC", { eventName: rawName }));
  }
  return parts.join(" · ");
}

export function ActivityDetailDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: ActivityEvent | null;
  workspaceLabelById?: Record<string, string>;
}) {
  const { t } = useTranslation(["activity"]);
  const dateTime = useWorkspaceDateTimeFormatter();

  const event = props.event;
  const hideMetaBlocks = event?.eventName === "workspace.member.roles.updated";

  const occurredAtText = React.useMemo(() => {
    if (!event?.occurredAt) return "-";
    const d = new Date(event.occurredAt);
    if (Number.isNaN(d.getTime())) return "-";
    return formatDateTimeWithPattern({
      date: d,
      locale: dateTime.localization.locale,
      timeZone: dateTime.localization.timeZone,
      dateFormat: dateTime.localization.dateFormat,
      includeTime: true,
    });
  }, [
    dateTime.localization.dateFormat,
    dateTime.localization.locale,
    dateTime.localization.timeZone,
    event?.occurredAt,
  ]);

  const workspaceLabel = React.useMemo(() => {
    const id = (event?.workspaceId || "").trim();
    if (!id) return null;
    return props.workspaceLabelById?.[id] ?? id;
  }, [event?.workspaceId, props.workspaceLabelById]);

  const actorSecondary = React.useMemo(() => {
    const id = event?.actor?.id || event?.actorUserId || "";
    return id ? id : null;
  }, [event?.actor?.id, event?.actorUserId]);

  const subjectSecondary = React.useMemo(() => {
    const id = event?.subject?.id || event?.subjectUserId || "";
    return id ? id : null;
  }, [event?.subject?.id, event?.subjectUserId]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={event ? buildTitle(t, event) : t("activity:ACTIVITY_DETAIL_TITLE")}
      description={event ? buildDescription(t, event) : undefined}
      contentClassName="max-w-[860px]"
    >
      {!event ? null : (
        <div className="space-y-4">
          {!hideMetaBlocks ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-caption text-label-secondary">
                    {t("activity:ACTIVITY_FIELD_EVENT_NAME")}
                  </div>
                  <div className="mt-1 font-mono text-caption wrap-break-word">
                    {event.eventName || "-"}
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-caption text-label-secondary">
                    {t("activity:ACTIVITY_FIELD_SOURCE")}
                  </div>
                  <div className="mt-1 text-footnote wrap-break-word">{event.source || "-"}</div>
                </div>
              </div>

              {event.workspaceId ? (
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-caption text-label-secondary">
                    {t("activity:ACTIVITY_TABLE_WORKSPACE")}
                  </div>
                  <div className="mt-1 text-footnote wrap-break-word">{workspaceLabel || "-"}</div>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-caption text-label-secondary">
                {t("activity:ACTIVITY_FIELD_OCCURRED_AT")}
              </div>
              <div className="mt-1 text-footnote">{occurredAtText}</div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-caption text-label-secondary">
                {t("activity:ACTIVITY_FIELD_TRACE_ID")}
              </div>
              <div className="mt-1 font-mono text-caption wrap-break-word">
                {event.traceId || "-"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-caption text-label-secondary">
                {t("activity:ACTIVITY_FIELD_ACTOR")}
              </div>
              <div className="mt-2">
                <ActivityUserPill
                  user={
                    event.actor
                      ? {
                          id: event.actor.id,
                          username: event.actor.username,
                          displayName: event.actor.displayName,
                          avatarUrl: event.actor.avatarUrl,
                        }
                      : event.actorUserId
                        ? {
                            id: event.actorUserId,
                            username: null,
                            displayName: null,
                            avatarUrl: null,
                          }
                        : null
                  }
                  secondary={actorSecondary}
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-caption text-label-secondary">
                {t("activity:ACTIVITY_FIELD_SUBJECT")}
              </div>
              <div className="mt-2">
                <ActivityUserPill
                  user={
                    event.subject
                      ? {
                          id: event.subject.id,
                          username: event.subject.username,
                          displayName: event.subject.displayName,
                          avatarUrl: event.subject.avatarUrl,
                        }
                      : event.subjectUserId
                        ? {
                            id: event.subjectUserId,
                            username: null,
                            displayName: null,
                            avatarUrl: null,
                          }
                        : null
                  }
                  secondary={subjectSecondary}
                />
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-caption text-label-secondary">
              {t("activity:ACTIVITY_FIELD_PROPERTIES")}
            </div>
            <pre className="mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap wrap-break-word text-caption">
              {safeJsonStringify(event.properties)}
            </pre>
          </div>
        </div>
      )}
    </SettingDialog>
  );
}
