import { AutoComplete, DatePicker, Input as AntInput } from "antd";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { DebounceSelect, type DebounceSelectOption } from "@/components/inputs/debounce-select";
import { LoaderOne } from "@/components/ui/loader";
import { ActivityDetailDialog } from "@/components/activity/activity-detail-dialog";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { listCatalogEventNames, resolveCatalogEntry } from "@/components/activity/event-catalog";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import * as activityApi from "@/api/activity";
import { listTeamUserOptions } from "@/api/team";

type ActivityFilters = {
  occurredFrom?: string;
  occurredTo?: string;
  eventName?: string;
  actorUserId?: string;
  subjectUserId?: string;
};

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeFilters(filters: ActivityFilters): ActivityFilters {
  const trimOrUndef = (v: string | undefined) => {
    const s = String(v || "").trim();
    return s ? s : undefined;
  };

  return {
    occurredFrom: trimOrUndef(filters.occurredFrom),
    occurredTo: trimOrUndef(filters.occurredTo),
    eventName: trimOrUndef(filters.eventName),
    actorUserId: trimOrUndef(filters.actorUserId),
    subjectUserId: trimOrUndef(filters.subjectUserId),
  };
}

export function WorkspaceActivityPage() {
  const { t } = useTranslation(["nav", "activity"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [filters, setFilters] = React.useState<ActivityFilters>(() => {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return {
      occurredFrom: from.toISOString(),
      occurredTo: to.toISOString(),
    };
  });

  const [rangeValue, setRangeValue] = React.useState<any[] | null>(null);
  React.useEffect(() => {
    if (!filters.occurredFrom && !filters.occurredTo) setRangeValue(null);
  }, [filters.occurredFrom, filters.occurredTo]);

  const [eventNameInput, setEventNameInput] = React.useState<string>(() => filters.eventName ?? "");
  const [eventNameOpen, setEventNameOpen] = React.useState<boolean>(false);

  const [actorOption, setActorOption] = React.useState<DebounceSelectOption | undefined>(undefined);
  const [subjectOption, setSubjectOption] = React.useState<DebounceSelectOption | undefined>(
    undefined,
  );

  const pageSize = 20;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const normalizedFilters = React.useMemo(() => normalizeFilters(filters), [filters]);
  const filtersKey = stableStringify({
    ...normalizedFilters,
    workspaceId: workspaceId || "",
  });
  React.useEffect(() => {
    // Reset scroll position when filters change (so user sees the newest results).
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filtersKey]);

  const queryEnabled = Boolean(workspaceId && String(workspaceId).trim());
  const listQuery = useInfiniteQuery({
    queryKey: ["activity", "workspace", workspaceId, pageSize, filtersKey] as const,
    enabled: queryEnabled,
    retry: false,
    meta: { silent: true },
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      activityApi.listWorkspaceActivity(String(workspaceId), {
        page: Number(pageParam) || 1,
        size: pageSize,
        from: normalizedFilters.occurredFrom,
        to: normalizedFilters.occurredTo,
        event_name: normalizedFilters.eventName,
        actor_user_id: normalizedFilters.actorUserId,
        subject_user_id: normalizedFilters.subjectUserId,
      }),
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
  });

  const items = React.useMemo(() => {
    const pages = listQuery.data?.pages ?? [];
    return pages.flatMap((p) => p.items ?? []);
  }, [listQuery.data?.pages]);

  const empty = items.length === 0;

  React.useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;
    if (!listQuery.hasNextPage) return;
    if (listQuery.isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!listQuery.hasNextPage) return;
        if (listQuery.isFetchingNextPage) return;
        void listQuery.fetchNextPage();
      },
      {
        root,
        rootMargin: "200px",
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [listQuery.fetchNextPage, listQuery.hasNextPage, listQuery.isFetchingNextPage, items.length]);

  const [selected, setSelected] = React.useState<activityApi.ActivityEvent | null>(null);

  const eventNameOptions = React.useMemo(() => {
    const needle = eventNameInput.trim().toLowerCase();
    const names = listCatalogEventNames();
    const filtered = needle
      ? names.filter((n) => n.toLowerCase().includes(needle)).slice(0, 20)
      : names.slice(0, 20);

    return filtered.map((name) => {
      const meta = resolveCatalogEntry(name);
      const title = meta ? t(`activity:${meta.titleKey}`) : name;
      return {
        value: name,
        label: (
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{title}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">{name}</div>
          </div>
        ),
      };
    });
  }, [eventNameInput, t]);

  return (
    <DefaultPage
      width="full"
      title={t("nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY")}
      description={t("activity:ACTIVITY_DESC_WORKSPACE")}
      contentClassName="min-h-0 flex flex-col"
      extra={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker.RangePicker
              showTime
              allowClear
              value={rangeValue as any}
              onChange={(values) => {
                setRangeValue((values as any) ?? null);
                const start = (values as any)?.[0];
                const end = (values as any)?.[1];
                const from = start?.toDate ? start.toDate().toISOString() : start?.toISOString?.();
                const to = end?.toDate ? end.toDate().toISOString() : end?.toISOString?.();
                setFilters((prev) => ({
                  ...prev,
                  occurredFrom: from || undefined,
                  occurredTo: to || undefined,
                }));
              }}
            />

            <AutoComplete
              value={eventNameInput}
              open={eventNameOpen}
              onDropdownVisibleChange={(open) => setEventNameOpen(open)}
              options={eventNameOptions as any}
              onChange={(next) => {
                const v = String(next || "");
                setEventNameInput(v);
                setEventNameOpen(true);
                setFilters((prev) => ({
                  ...prev,
                  eventName: v.trim() ? v : undefined,
                }));
              }}
              onSelect={(v) => {
                const s = String(v || "");
                setEventNameInput(s);
                setEventNameOpen(false);
                setFilters((prev) => ({
                  ...prev,
                  eventName: s.trim() ? s : undefined,
                }));
              }}
              style={{ width: 320, maxWidth: "100%" }}
            >
              <AntInput
                size="large"
                allowClear
                onFocus={() => setEventNameOpen(true)}
                prefix={<Search className="size-4 text-muted-foreground" />}
                placeholder={t("activity:ACTIVITY_FILTER_EVENT_NAME_PLACEHOLDER")}
                aria-label={t("activity:ACTIVITY_FILTER_EVENT_NAME")}
              />
            </AutoComplete>

            <DebounceSelect
              labelInValue
              value={
                filters.actorUserId
                  ? (actorOption ?? {
                      value: filters.actorUserId,
                      label: filters.actorUserId,
                    })
                  : undefined
              }
              allowClear
              disabled={!workspaceId}
              placeholder={t("activity:ACTIVITY_FILTER_ACTOR")}
              style={{ width: 260, maxWidth: "100%" }}
              fetchOptions={async (search) => {
                if (!workspaceId) return [];
                const pageData = await listTeamUserOptions(String(workspaceId), {
                  q: search,
                  page: 1,
                  size: 20,
                });
                return (pageData.items ?? []).map((u) => ({
                  value: u.value,
                  label: u.label,
                  avatarUrl: u.avatarUrl ?? null,
                }));
              }}
              onChange={(value) => {
                const v = (value as any)?.value ?? null;
                const label = (value as any)?.label ?? null;
                const avatarUrl =
                  (value as any)?.avatarUrl ?? (value as any)?.data?.avatarUrl ?? null;
                if (v) {
                  setActorOption({
                    value: String(v),
                    label: String(label || v),
                    avatarUrl,
                  });
                } else {
                  setActorOption(undefined);
                }
                setFilters((prev) => ({
                  ...prev,
                  actorUserId: v ? String(v) : undefined,
                }));
              }}
            />

            <DebounceSelect
              labelInValue
              value={
                filters.subjectUserId
                  ? (subjectOption ?? {
                      value: filters.subjectUserId,
                      label: filters.subjectUserId,
                    })
                  : undefined
              }
              allowClear
              disabled={!workspaceId}
              placeholder={t("activity:ACTIVITY_FILTER_SUBJECT")}
              style={{ width: 260, maxWidth: "100%" }}
              fetchOptions={async (search) => {
                if (!workspaceId) return [];
                const pageData = await listTeamUserOptions(String(workspaceId), {
                  q: search,
                  page: 1,
                  size: 20,
                });
                return (pageData.items ?? []).map((u) => ({
                  value: u.value,
                  label: u.label,
                  avatarUrl: u.avatarUrl ?? null,
                }));
              }}
              onChange={(value) => {
                const v = (value as any)?.value ?? null;
                const label = (value as any)?.label ?? null;
                const avatarUrl =
                  (value as any)?.avatarUrl ?? (value as any)?.data?.avatarUrl ?? null;
                if (v) {
                  setSubjectOption({
                    value: String(v),
                    label: String(label || v),
                    avatarUrl,
                  });
                } else {
                  setSubjectOption(undefined);
                }
                setFilters((prev) => ({
                  ...prev,
                  subjectUserId: v ? String(v) : undefined,
                }));
              }}
            />
          </div>

          {listQuery.isFetching && !listQuery.isLoading ? <LoaderOne /> : null}
        </div>
      }
    >
      <PageState
        loading={listQuery.isLoading}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        empty={empty}
        loadingVariant="table"
        emptyTitle={t("activity:ACTIVITY_EMPTY_TITLE")}
        emptyDescription={t("activity:ACTIVITY_EMPTY_DESC")}
        className="flex-1 min-h-0"
      >
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-4">
          <div className="py-4">
            <ActivityTimeline
              items={items}
              onSelect={(e) => setSelected(e)}
              loading={listQuery.isFetchingNextPage}
              titleSpan={4}
            />

            <div ref={sentinelRef} className="h-10" />
          </div>
        </div>
      </PageState>

      <ActivityDetailDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        event={selected}
      />
    </DefaultPage>
  );
}
