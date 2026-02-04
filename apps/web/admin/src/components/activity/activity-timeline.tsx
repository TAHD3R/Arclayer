import { Tag, Timeline } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import type { ActivityEvent } from "@/api/activity";
import { resolveCatalogEntry } from "@/components/activity/event-catalog";
import { formatDateTimeWithPattern } from "@/lib/time/date-time";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { ActivityUserPill } from "@/components/activity/activity-user-pill";

type ActivityTimelineProps = {
  items: ActivityEvent[];
  onViewDetail?: (event: ActivityEvent) => void;
  workspaceLabelById?: Record<string, string>;
};

type DayGroup = {
  key: string; // YYYY-MM-DD (in current timezone)
  label: string;
  items: ActivityEvent[];
};

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function groupByDay(params: {
  items: ActivityEvent[];
  locale: string;
  timeZone: string;
}): DayGroup[] {
  const map = new Map<string, ActivityEvent[]>();
  for (const item of params.items) {
    const d = safeDate(item.occurredAt);
    const dayKey = d
      ? formatDateTimeWithPattern({
          date: d,
          locale: params.locale,
          timeZone: params.timeZone,
          dateFormat: "YYYY-MM-DD",
          includeTime: false,
        })
      : "unknown";
    const list = map.get(dayKey) ?? [];
    list.push(item);
    map.set(dayKey, list);
  }

  const groups: DayGroup[] = [];
  for (const [key, items] of map.entries()) {
    groups.push({
      key,
      label: key === "unknown" ? "-" : key,
      items: items.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))),
    });
  }

  // Most recent day first.
  return groups.sort((a, b) => b.key.localeCompare(a.key));
}

export function ActivityTimeline(props: ActivityTimelineProps) {
  const { t } = useTranslation(["activity"]);
  const prefs = usePreferencesStore();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const workspaceLabelById = props.workspaceLabelById ?? {};

  const groups = React.useMemo(
    () =>
      groupByDay({
        items: props.items,
        locale: prefs.locale,
        timeZone,
      }),
    [prefs.locale, props.items, timeZone],
  );

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur py-2">
            <div className="text-sm font-semibold">{group.label}</div>
          </div>

          <Timeline
            className={cn("mt-2", "[&_.ant-timeline-item-label]:!w-[120px]")}
            items={group.items.map((event) => {
              const d = safeDate(event.occurredAt);
              const timeText = d
                ? (formatDateTimeWithPattern({
                    date: d,
                    locale: prefs.locale,
                    timeZone,
                    dateFormat: undefined,
                    includeTime: true,
                  }).split(" ")[1] ?? "-")
                : "-";

              const catalog = resolveCatalogEntry(event.eventName);
              const title = catalog ? t(`activity:${catalog.titleKey}`) : event.eventName;
              const desc = catalog?.descriptionKey ? t(`activity:${catalog.descriptionKey}`) : null;

              const actor = event.actor
                ? {
                    id: event.actor.id,
                    username: event.actor.username,
                    displayName: event.actor.displayName,
                    avatarUrl: event.actor.avatarUrl,
                  }
                : event.actorUserId
                  ? { id: event.actorUserId, username: null, displayName: null, avatarUrl: null }
                  : null;

              const subjectText = (() => {
                const label =
                  event.subject?.displayName ||
                  event.subject?.username ||
                  event.subjectUserId ||
                  "";
                return String(label || "").trim() || null;
              })();

              const wsLabel = (() => {
                const id = (event.workspaceId || "").trim();
                if (!id) return null;
                return workspaceLabelById[id] ?? id;
              })();

              return {
                key: event.id,
                label: <span className="font-mono text-xs text-muted-foreground">{timeText}</span>,
                children: (
                  <div className="min-w-0 pb-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium break-words">{title}</div>
                        {desc ? (
                          <div className="mt-0.5 text-xs text-muted-foreground break-words">
                            {desc}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {props.onViewDetail ? (
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                              "hover:bg-muted text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => props.onViewDetail?.(event)}
                          >
                            {t("activity:ACTIVITY_ACTION_VIEW_DETAIL")}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="min-w-[220px] max-w-full">
                        <ActivityUserPill user={actor} size={22} />
                      </div>
                      {subjectText ? <Tag>{subjectText}</Tag> : null}
                      {wsLabel ? <Tag>{wsLabel}</Tag> : null}
                      {event.source ? <Tag>{event.source}</Tag> : null}
                    </div>

                    <div className="mt-2">
                      <div className="font-mono text-xs text-muted-foreground break-words">
                        {event.eventName}
                      </div>
                    </div>
                  </div>
                ),
              };
            })}
          />
        </div>
      ))}
    </div>
  );
}
