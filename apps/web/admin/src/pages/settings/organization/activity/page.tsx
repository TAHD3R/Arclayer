import { AutoComplete, DatePicker, Input as AntInput, Pagination } from "antd";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { ActivityDetailDialog } from "@/components/activity/activity-detail-dialog";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { listCatalogEventNames, resolveCatalogEntry } from "@/components/activity/event-catalog";
import { DebounceSelect, type DebounceSelectOption } from "@/components/inputs/debounce-select";
import { LoaderOne } from "@/components/ui/loader";
import { listMyWorkspaces } from "@/api/workspaces";
import * as activityApi from "@/api/activity";
import { listTeamUserOptions } from "@/api/team";

type ActivityFilters = {
  occurredFrom?: string;
  occurredTo?: string;
  eventName?: string;
  workspaceId?: string;
  actorUserId?: string;
};

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function OrganizationActivityPage() {
  const { t } = useTranslation(["nav", "activity"]);

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

  const [workspaceOption, setWorkspaceOption] = React.useState<DebounceSelectOption | undefined>(
    undefined,
  );
  const [actorOption, setActorOption] = React.useState<DebounceSelectOption | undefined>(undefined);

  const selectedWorkspaceId = (filters.workspaceId || "").trim() || null;

  const [page, setPage] = React.useState<number>(1);
  const [size, setSize] = React.useState<number>(20);

  const filtersKey = stableStringify(filters);
  React.useEffect(() => {
    setPage(1);
  }, [filtersKey]);

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces"],
    queryFn: async () => listMyWorkspaces(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const workspaceItems = workspacesQuery.data?.items ?? [];

  const workspaceLabelById = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const w of workspaceItems) {
      map[String(w.workspaceId)] = w.name || w.slug || w.workspaceId;
    }
    return map;
  }, [workspaceItems]);

  const listQuery = useQuery({
    queryKey: ["activity", "org", page, size, filters] as const,
    placeholderData: keepPreviousData,
    retry: false,
    meta: { silent: true },
    queryFn: async () =>
      activityApi.listSystemActivity({
        page,
        size,
        from: filters.occurredFrom,
        to: filters.occurredTo,
        event_name: filters.eventName,
        workspace_id: filters.workspaceId,
        actor_user_id: filters.actorUserId,
      }),
  });

  const items = listQuery.data?.items ?? [];
  const empty = items.length === 0;

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
      title={t("nav:NAV_ORG_ACTIVITY")}
      description={t("activity:ACTIVITY_DESC_ORG")}
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
                setFilters((prev) => ({ ...prev, eventName: v.trim() ? v : undefined }));
              }}
              onSelect={(v) => {
                const s = String(v || "");
                setEventNameInput(s);
                setEventNameOpen(false);
                setFilters((prev) => ({ ...prev, eventName: s.trim() ? s : undefined }));
              }}
              style={{ width: 320, maxWidth: "100%" }}
            >
              <AntInput
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
                selectedWorkspaceId
                  ? (workspaceOption ?? { value: selectedWorkspaceId, label: selectedWorkspaceId })
                  : undefined
              }
              allowClear
              disabled={workspacesQuery.isLoading}
              placeholder={t("activity:ACTIVITY_FILTER_WORKSPACE")}
              style={{ width: 260, maxWidth: "100%" }}
              fetchOptions={async (search) => {
                const needle = (search || "").trim().toLowerCase();
                const rows = !needle
                  ? workspaceItems
                  : workspaceItems.filter((w) => {
                      const hay = `${w.name || ""} ${w.slug || ""} ${w.workspaceId}`.toLowerCase();
                      return hay.includes(needle);
                    });

                return rows.slice(0, 20).map((w) => ({
                  value: w.workspaceId,
                  label: w.name || w.slug || w.workspaceId,
                }));
              }}
              onChange={(value) => {
                const v = (value as any)?.value ?? null;
                const label = (value as any)?.label ?? null;
                if (v) {
                  setWorkspaceOption({ value: String(v), label: String(label || v) });
                } else {
                  setWorkspaceOption(undefined);
                }
                setFilters((prev) => ({
                  ...prev,
                  workspaceId: v ? String(v) : undefined,
                  // workspace 变化时，操作者筛选需要重置（避免跨 workspace 误筛）
                  actorUserId: undefined,
                }));
                setActorOption(undefined);
              }}
            />

            <DebounceSelect
              labelInValue
              value={
                filters.actorUserId
                  ? (actorOption ?? { value: filters.actorUserId, label: filters.actorUserId })
                  : undefined
              }
              allowClear
              disabled={!selectedWorkspaceId}
              placeholder={
                selectedWorkspaceId
                  ? t("activity:ACTIVITY_FILTER_ACTOR")
                  : t("activity:ACTIVITY_FILTER_ACTOR_NEED_WORKSPACE")
              }
              style={{ width: 260, maxWidth: "100%" }}
              fetchOptions={async (search) => {
                if (!selectedWorkspaceId) return [];
                const pageData = await listTeamUserOptions(selectedWorkspaceId, {
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
                if (v) {
                  setActorOption({
                    value: String(v),
                    label: String(label || v),
                  });
                } else {
                  setActorOption(undefined);
                }
                setFilters((prev) => ({ ...prev, actorUserId: v ? String(v) : undefined }));
              }}
            />
          </div>

          {listQuery.isFetching && !listQuery.isLoading ? <LoaderOne /> : null}
        </div>
      }
    >
      <PageState
        loading={listQuery.isLoading || workspacesQuery.isLoading}
        error={listQuery.error || workspacesQuery.error}
        onRetry={() => {
          void workspacesQuery.refetch();
          void listQuery.refetch();
        }}
        empty={empty}
        loadingVariant="table"
        emptyTitle={t("activity:ACTIVITY_EMPTY_TITLE")}
        emptyDescription={t("activity:ACTIVITY_EMPTY_DESC")}
        className="flex-1 min-h-0"
      >
        <div className="rounded-md border p-4 overflow-auto flex-1 min-h-0">
          <ActivityTimeline
            items={items}
            onViewDetail={(e) => setSelected(e)}
            workspaceLabelById={workspaceLabelById}
          />
        </div>

        <div className="flex items-center justify-end pt-4">
          <Pagination
            current={listQuery.data?.page ?? page}
            pageSize={listQuery.data?.size ?? size}
            total={listQuery.data?.total ?? 0}
            showSizeChanger
            onChange={(nextPage, nextSize) => {
              setPage(nextPage);
              setSize(nextSize);
            }}
          />
        </div>
      </PageState>

      <ActivityDetailDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        event={selected}
        workspaceLabelById={workspaceLabelById}
      />
    </DefaultPage>
  );
}
