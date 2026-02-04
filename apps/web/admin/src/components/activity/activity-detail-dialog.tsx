import { Tag } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import type { ActivityEvent } from "@/api/activity";
import { SettingDialog } from "@/components/common/setting-dialog";
import { formatDateTimeWithPattern } from "@/lib/time/date-time";
import { resolveCatalogEntry } from "@/components/activity/event-catalog";
import { ActivityUserPill } from "@/components/activity/activity-user-pill";
import { usePreferencesStore } from "@/stores/use-preference-store";

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildTitle(t: (key: string, options?: any) => string, event: ActivityEvent): string {
  const entry = resolveCatalogEntry(event.eventName);
  if (!entry) return t("activity:ACTIVITY_DETAIL_TITLE");
  return t(`activity:${entry.titleKey}`);
}

function buildDescription(t: (key: string, options?: any) => string, event: ActivityEvent): string {
  const entry = resolveCatalogEntry(event.eventName);
  const rawName = (event.eventName || "").trim() || "-";
  const parts: string[] = [];
  parts.push(`${t("activity:ACTIVITY_FIELD_EVENT_NAME")}: ${rawName}`);
  if (entry?.descriptionKey) parts.push(t(`activity:${entry.descriptionKey}`));
  return parts.join(" · ");
}

export function ActivityDetailDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: ActivityEvent | null;
  workspaceLabelById?: Record<string, string>;
}) {
  const { t } = useTranslation(["activity"]);
  const prefs = usePreferencesStore();

  const event = props.event;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const occurredAtText = React.useMemo(() => {
    if (!event?.occurredAt) return "-";
    const d = new Date(event.occurredAt);
    if (Number.isNaN(d.getTime())) return "-";
    return formatDateTimeWithPattern({
      date: d,
      locale: prefs.locale,
      timeZone,
      dateFormat: undefined,
      includeTime: true,
    });
  }, [event?.occurredAt, prefs.locale, timeZone]);

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
          <div className="flex flex-wrap gap-2">
            <Tag color="blue">{event.eventName}</Tag>
            {event.source ? <Tag>{event.source}</Tag> : null}
            {event.workspaceId ? <Tag>{workspaceLabel}</Tag> : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {t("activity:ACTIVITY_FIELD_OCCURRED_AT")}
              </div>
              <div className="mt-1 text-sm">{occurredAtText}</div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {t("activity:ACTIVITY_FIELD_TRACE_ID")}
              </div>
              <div className="mt-1 font-mono text-xs break-words">{event.traceId || "-"}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
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
              <div className="text-xs text-muted-foreground">
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
            <div className="text-xs text-muted-foreground">
              {t("activity:ACTIVITY_FIELD_PROPERTIES")}
            </div>
            <pre className="mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap break-words text-xs">
              {safeJsonStringify(event.properties)}
            </pre>
          </div>
        </div>
      )}
    </SettingDialog>
  );
}
