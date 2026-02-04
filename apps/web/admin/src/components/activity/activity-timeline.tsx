import type { CSSProperties } from "react";
import { Timeline } from "antd";
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
  onSelect?: (event: ActivityEvent) => void;
  loading?: boolean;
  titleSpan?: number | string;
  reverse?: boolean;
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
  const dateFormatter = new Intl.DateTimeFormat(params.locale || undefined, {
    timeZone: params.timeZone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  for (const [key, group] of map.entries()) {
    const label = (() => {
      if (key === "unknown") return "-";
      if (key === todayKey) return params.t("activity:ACTIVITY_DAY_TODAY");
      if (key === yesterdayKey) return params.t("activity:ACTIVITY_DAY_YESTERDAY");
      return group.sampleDate ? dateFormatter.format(group.sampleDate) : key;
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

export function ActivityTimeline(props: ActivityTimelineProps) {
  const { t } = useTranslation(["activity"]);
  const prefs = usePreferencesStore();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const titleSpan = props.titleSpan ?? 4;
  const reverse = props.reverse ?? false;

  const groups = React.useMemo(
    () =>
      groupByDay({
        items: props.items,
        locale: prefs.locale,
        timeZone,
        t: (key) => t(key),
      }),
    [prefs.locale, props.items, t, timeZone],
  );

  return (
    <div>
      {groups.map((group, groupIndex) => {
        const showLoadingInThisGroup = Boolean(props.loading) && groupIndex === groups.length - 1;

        return (
          <div key={group.key}>
            <div className="sticky top-0 z-10 bg-background/90 backdrop-blur py-2">
              <div className="text-xl font-bold">{group.label}</div>
            </div>

            <Timeline
              className={cn("mt-2")}
              titleSpan={titleSpan}
              reverse={reverse}
              items={[
                ...group.items.map((event) => {
                  const d = safeDate(event.occurredAt);
                  const timeText = d
                    ? formatTimeHHmm({ date: d, locale: prefs.locale, timeZone })
                    : "-";

                  const catalog = resolveCatalogEntry(event.eventName);
                  const eventTitle = catalog ? t(`activity:${catalog.titleKey}`) : event.eventName;
                  const eventDesc = catalog?.descriptionKey
                    ? t(`activity:${catalog.descriptionKey}`)
                    : null;

                  const actor = event.actor
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
                      : null;

                  const clickable = Boolean(props.onSelect);
                  const onSelect = () => props.onSelect?.(event);

                  const cardClassName = cn(
                    "group min-w-0 rounded-md px-3 py-2",
                    "transition-colors duration-150",
                    clickable ? "cursor-pointer hover:bg-muted/60 active:scale-[0.99]" : null,
                  );

                  const cardStyle: CSSProperties | undefined = clickable
                    ? { outline: "none" }
                    : undefined;

                  return {
                    key: event.id,
                    title: (
                      <time
                        className="font-mono font-semibold text-muted-foreground"
                        dateTime={event.occurredAt}
                        title={
                          d
                            ? formatDateTimeWithPattern({
                                date: d,
                                locale: prefs.locale,
                                timeZone,
                                dateFormat: "YYYY-MM-DD",
                                includeTime: true,
                              })
                            : undefined
                        }
                      >
                        {timeText}
                      </time>
                    ),
                    content: (
                      <article
                        className={cardClassName}
                        style={cardStyle}
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={clickable ? onSelect : undefined}
                        onKeyDown={
                          clickable
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onSelect();
                                }
                              }
                            : undefined
                        }
                      >
                        <header className="min-w-0">
                          <div className="font-semibold wrap-break-word">{eventTitle}</div>
                          {eventDesc ? (
                            <p className="mt-1 text-muted-foreground wrap-break-word">
                              {eventDesc}
                            </p>
                          ) : null}
                        </header>

                        <div>
                          <ActivityUserPill user={actor} size={24} />
                        </div>
                      </article>
                    ),
                    styles: {
                      root: {
                        paddingBottom: 10,
                      },
                    },
                  };
                }),
                ...(showLoadingInThisGroup
                  ? [
                      {
                        key: `${group.key}:loading`,
                        loading: true,
                        title: <span className="font-mono text-xs text-muted-foreground"> </span>,
                        content: <div className="h-6" />,
                        styles: {
                          root: {
                            paddingBottom: 0,
                          },
                          content: {
                            opacity: 0.65,
                          },
                        },
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        );
      })}
    </div>
  );
}
