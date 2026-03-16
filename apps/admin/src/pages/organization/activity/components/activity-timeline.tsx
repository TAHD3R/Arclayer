import * as React from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, Circle, ShieldAlert } from "lucide-react";

import type { ActivityEvent } from "@/types/api";
import type { ActivityEventLevel } from "@/pages/organization/activity/constants";
import { resolveCatalogEntry } from "@/pages/organization/activity/constants";
import { ActivityUserPill } from "@/pages/organization/activity/components/activity-user-pill";
import {
  Timeline,
  TimelineContent,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
} from "@arclayer/ui/timeline";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { formatDateTimeWithPattern } from "@/lib/time/date-time";
import { cn } from "@arclayer/lib/utils";

type ActivityTimelineProps = {
  items: ActivityEvent[];
  onSelect?: (event: ActivityEvent) => void;
  loading?: boolean;
};

type DayGroup = {
  key: string; // YYYY-MM-DD (in current timezone)
  label: string;
  sampleDate: Date | null;
  items: ActivityEvent[];
};

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatTimeHHmm(params: { date: Date; locale: string; timeZone: string }): string {
  const dtf = new Intl.DateTimeFormat(params.locale || undefined, {
    timeZone: params.timeZone || undefined,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return dtf.format(params.date);
}

function groupByDay(params: {
  items: ActivityEvent[];
  locale: string;
  timeZone: string;
  dateFormat: string | undefined;
  t: (key: string) => string;
}): DayGroup[] {
  const map = new Map<string, { items: ActivityEvent[]; sampleDate: Date | null }>();

  const todayKey = formatDateTimeWithPattern({
    date: new Date(),
    locale: params.locale,
    timeZone: params.timeZone,
    dateFormat: "YYYY-MM-DD",
    includeTime: false,
  });
  const yesterdayKey = formatDateTimeWithPattern({
    date: new Date(Date.now() - 24 * 60 * 60 * 1000),
    locale: params.locale,
    timeZone: params.timeZone,
    dateFormat: "YYYY-MM-DD",
    includeTime: false,
  });

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

    const group = map.get(dayKey) ?? { items: [], sampleDate: d };
    group.items.push(item);
    if (d && (!group.sampleDate || d.getTime() > group.sampleDate.getTime())) {
      group.sampleDate = d;
    }
    map.set(dayKey, group);
  }

  const groups: DayGroup[] = [];

  for (const [key, group] of map.entries()) {
    const label = (() => {
      if (key === "unknown") return "-";
      if (key === todayKey) return params.t("activity:ACTIVITY_DAY_TODAY");
      if (key === yesterdayKey) return params.t("activity:ACTIVITY_DAY_YESTERDAY");
      return group.sampleDate
        ? formatDateTimeWithPattern({
            date: group.sampleDate,
            locale: params.locale,
            timeZone: params.timeZone,
            dateFormat: params.dateFormat,
            includeTime: false,
          })
        : key;
    })();

    groups.push({
      key,
      label,
      sampleDate: group.sampleDate,
      items: group.items.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))),
    });
  }

  return groups.sort((a, b) => b.key.localeCompare(a.key));
}

const LEVEL_INDICATOR: Record<ActivityEventLevel, { icon: typeof Activity; className: string }> = {
  info: { icon: Activity, className: "text-blue-500" },
  warning: { icon: AlertTriangle, className: "text-amber-500" },
  danger: { icon: ShieldAlert, className: "text-destructive" },
};

function getEventIndicator(level?: ActivityEventLevel) {
  const config = level ? LEVEL_INDICATOR[level] : null;
  return {
    Icon: config?.icon ?? Circle,
    className: config?.className ?? "text-label-secondary",
  };
}

export function ActivityTimeline(props: ActivityTimelineProps) {
  const { t } = useTranslation(["activity"]);
  const dateTime = useWorkspaceDateTimeFormatter();

  const groups = React.useMemo(
    () =>
      groupByDay({
        items: props.items,
        locale: dateTime.localization.locale,
        timeZone: dateTime.localization.timeZone,
        dateFormat: dateTime.localization.dateFormat,
        t: (key) => t(key),
      }),
    [
      dateTime.localization.dateFormat,
      dateTime.localization.locale,
      dateTime.localization.timeZone,
      props.items,
      t,
    ],
  );

  const clickable = Boolean(props.onSelect);

  return (
    <div>
      {groups.map((group, groupIndex) => {
        const showLoading = Boolean(props.loading) && groupIndex === groups.length - 1;

        return (
          <div key={group.key}>
            <div className="sticky top-0 z-10 bg-background/90 backdrop-blur py-2">
              <div className="text-title2 font-bold">{group.label}</div>
            </div>

            <Timeline orientation="vertical" defaultValue={Infinity} className="mt-2">
              {group.items.map((event, index) => (
                <ActivityTimelineEntry
                  key={event.id}
                  event={event}
                  step={index + 1}
                  clickable={clickable}
                  onSelect={props.onSelect}
                  dateTime={dateTime}
                  t={t}
                />
              ))}

              {showLoading && (
                <TimelineItem step={group.items.length + 1}>
                  <TimelineSeparator />
                  <TimelineIndicator className="flex size-6 items-center justify-center border-0 bg-background animate-pulse">
                    <Circle className="size-3 text-label-secondary" />
                  </TimelineIndicator>
                  <TimelineContent>
                    <div className="h-6 opacity-65" />
                  </TimelineContent>
                </TimelineItem>
              )}
            </Timeline>
          </div>
        );
      })}
    </div>
  );
}

type DateTimeFormatter = ReturnType<typeof useWorkspaceDateTimeFormatter>;

type ActivityTimelineEntryProps = {
  event: ActivityEvent;
  step: number;
  clickable: boolean;
  onSelect?: (event: ActivityEvent) => void;
  dateTime: DateTimeFormatter;
  t: (key: string, options?: Record<string, unknown>) => string;
};

function ActivityTimelineEntry({
  event,
  step,
  clickable,
  onSelect,
  dateTime,
  t,
}: ActivityTimelineEntryProps) {
  const d = safeDate(event.occurredAt);
  const timeText = d
    ? formatTimeHHmm({
        date: d,
        locale: dateTime.localization.locale,
        timeZone: dateTime.localization.timeZone,
      })
    : "-";

  const catalog = resolveCatalogEntry(event.eventName);
  const rawEventName = (event.eventName || "").trim() || "-";
  const eventTitle = catalog
    ? t(`activity:${catalog.titleKey}`)
    : t("activity:ACTIVITY_EVENT_UNKNOWN_TITLE", { eventName: rawEventName });
  const eventDesc = catalog?.descriptionKey
    ? t(`activity:${catalog.descriptionKey}`)
    : t("activity:ACTIVITY_EVENT_UNKNOWN_DESC", { eventName: rawEventName });
  const { Icon, className: iconClass } = getEventIndicator(catalog?.level);

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

  const handleSelect = () => onSelect?.(event);

  const cardClassName = cn(
    "min-w-0 rounded-md px-3 py-2",
    "transition-colors duration-150",
    clickable && "cursor-pointer hover:bg-muted/60 active:scale-[0.99]",
  );

  return (
    <TimelineItem step={step}>
      <TimelineSeparator />
      <TimelineIndicator className="flex size-6 items-center justify-center border-0 bg-background">
        <Icon className={cn("size-3.5", iconClass)} />
      </TimelineIndicator>

      <div className="flex items-start gap-3 min-w-0 pb-2.5">
        <time
          className="shrink-0 w-12 pt-0.5 font-mono font-semibold text-label-secondary"
          dateTime={event.occurredAt}
          title={
            d
              ? formatDateTimeWithPattern({
                  date: d,
                  locale: dateTime.localization.locale,
                  timeZone: dateTime.localization.timeZone,
                  dateFormat: dateTime.localization.dateFormat,
                  includeTime: true,
                })
              : undefined
          }
        >
          {timeText}
        </time>

        <article
          className={cardClassName}
          style={clickable ? { outline: "none" } : undefined}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? handleSelect : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect();
                  }
                }
              : undefined
          }
        >
          <header className="min-w-0">
            <div className="font-semibold wrap-break-word">{eventTitle}</div>
            {eventDesc ? (
              <p className="mt-1 text-label-secondary wrap-break-word">{eventDesc}</p>
            ) : null}
          </header>
          <div>
            <ActivityUserPill user={actor} size={24} />
          </div>
        </article>
      </div>
    </TimelineItem>
  );
}
