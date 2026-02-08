import { AutoComplete, Button, DatePicker, Input as AntInput } from "antd";
import { Filter, Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DebounceSelect, type DebounceSelectOption } from "@/components/inputs/debounce-select";
import { listCatalogEventNames, resolveCatalogEntry } from "@/components/activity/event-catalog";

export type ActivityFilters = {
  occurredFrom?: string;
  occurredTo?: string;
  eventName?: string;
  workspaceId?: string;
  actorUserId?: string;
  subjectUserId?: string;
};

function normalizeFilters(filters: ActivityFilters): ActivityFilters {
  const trimOrUndef = (v: string | undefined) => {
    const s = String(v || "").trim();
    return s ? s : undefined;
  };

  return {
    occurredFrom: trimOrUndef(filters.occurredFrom),
    occurredTo: trimOrUndef(filters.occurredTo),
    eventName: trimOrUndef(filters.eventName),
    workspaceId: trimOrUndef(filters.workspaceId),
    actorUserId: trimOrUndef(filters.actorUserId),
    subjectUserId: trimOrUndef(filters.subjectUserId),
  };
}

type RangePickerValue = NonNullable<React.ComponentProps<typeof DatePicker.RangePicker>["value"]>;

type SelectLikeOption = {
  value: string | number;
  label?: React.ReactNode;
  avatarUrl?: string | null;
  data?: { avatarUrl?: string | null };
};

function toSelectLikeOption(value: unknown): SelectLikeOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!("value" in value)) return null;
  const option = value as SelectLikeOption;
  if (typeof option.value !== "string" && typeof option.value !== "number") return null;
  return option;
}

function toIsoRangeBoundary(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("toDate" in value && typeof value.toDate === "function") {
    const dateValue = value.toDate() as Date;
    return dateValue.toISOString();
  }
  if ("toISOString" in value && typeof value.toISOString === "function") {
    return value.toISOString() as string;
  }
  return undefined;
}

export function ActivityFilterPopover(props: {
  scope: "workspace" | "org";
  /**
   * Workspace scope uses the current workspace to fetch user options (actor/subject).
   * Org scope ignores this and uses `draft.workspaceId` instead.
   */
  workspaceId?: string | null;
  value: ActivityFilters;
  defaultValue: ActivityFilters;
  onApply: (next: ActivityFilters) => void;
  workspaceItems?: Array<{ workspaceId: string; name?: string | null; slug?: string | null }>;
  workspacesLoading?: boolean;
  fetchUserOptions: (workspaceId: string, q: string) => Promise<DebounceSelectOption[]>;
}) {
  const { t } = useTranslation(["activity"]);

  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ActivityFilters>(() => props.value);

  const [rangeValue, setRangeValue] = React.useState<RangePickerValue | null>(null);
  React.useEffect(() => {
    if (!draft.occurredFrom && !draft.occurredTo) setRangeValue(null);
  }, [draft.occurredFrom, draft.occurredTo]);

  const [eventNameInput, setEventNameInput] = React.useState<string>(
    () => props.value.eventName ?? "",
  );
  const [eventNameOpen, setEventNameOpen] = React.useState<boolean>(false);

  const [workspaceOption, setWorkspaceOption] = React.useState<DebounceSelectOption | undefined>(
    undefined,
  );
  const [actorOption, setActorOption] = React.useState<DebounceSelectOption | undefined>(undefined);
  const [subjectOption, setSubjectOption] = React.useState<DebounceSelectOption | undefined>(
    undefined,
  );

  // Open -> draft/value sync. Close -> discard draft (apply only happens on "Done").
  React.useEffect(() => {
    if (!open) return;
    setDraft(props.value);
    setEventNameInput(props.value.eventName ?? "");
    setEventNameOpen(false);
  }, [open, props.value]);

  const selectedWorkspaceId =
    props.scope === "workspace"
      ? (props.workspaceId ? String(props.workspaceId) : "").trim() || null
      : (draft.workspaceId || "").trim() || null;

  const canPickActorSubject = Boolean(selectedWorkspaceId);

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="text"
          icon={<Filter size={18} />}
          title={t("activity:ACTIVITY_FILTER_TITLE")}
          aria-label={t("activity:ACTIVITY_FILTER_TITLE")}
          style={{ height: 40 }}
          className="!bg-transparent hover:!bg-accent/40"
        />
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-96 p-3">
        <div className="font-bold">{t("activity:ACTIVITY_FILTER_TITLE")}</div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {t("activity:ACTIVITY_FIELD_OCCURRED_AT")}
            </div>
            <DatePicker.RangePicker
              showTime
              allowClear
              value={rangeValue}
              onChange={(values) => {
                setRangeValue(values ?? null);
                const start = values?.[0];
                const end = values?.[1];
                const occurredFrom = toIsoRangeBoundary(start);
                const occurredTo = toIsoRangeBoundary(end);
                setDraft((prev) => ({
                  ...prev,
                  occurredFrom: occurredFrom || undefined,
                  occurredTo: occurredTo || undefined,
                }));
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {t("activity:ACTIVITY_FILTER_EVENT_NAME")}
            </div>

            <AutoComplete
              value={eventNameInput}
              open={eventNameOpen}
              onDropdownVisibleChange={(nextOpen) => setEventNameOpen(nextOpen)}
              options={eventNameOptions}
              onChange={(next) => {
                const v = String(next || "");
                setEventNameInput(v);
                setEventNameOpen(true);
                setDraft((prev) => ({ ...prev, eventName: v.trim() ? v : undefined }));
              }}
              onSelect={(v) => {
                const s = String(v || "");
                setEventNameInput(s);
                setEventNameOpen(false);
                setDraft((prev) => ({ ...prev, eventName: s.trim() ? s : undefined }));
              }}
            >
              <AntInput
                allowClear
                onFocus={() => setEventNameOpen(true)}
                prefix={<Search className="size-4 text-muted-foreground" />}
                placeholder={t("activity:ACTIVITY_FILTER_EVENT_NAME_PLACEHOLDER")}
                aria-label={t("activity:ACTIVITY_FILTER_EVENT_NAME")}
              />
            </AutoComplete>
          </div>

          {props.scope === "org" ? (
            <div className="grid grid-cols-1 gap-1.5">
              <div className="text-sm text-muted-foreground">
                {t("activity:ACTIVITY_FILTER_WORKSPACE")}
              </div>

              <DebounceSelect
                labelInValue
                value={
                  draft.workspaceId
                    ? (workspaceOption ?? { value: draft.workspaceId, label: draft.workspaceId })
                    : undefined
                }
                allowClear
                disabled={Boolean(props.workspacesLoading)}
                placeholder={t("activity:ACTIVITY_FILTER_WORKSPACE")}
                fetchOptions={async (search) => {
                  const items = props.workspaceItems ?? [];
                  const needle = (search || "").trim().toLowerCase();
                  const rows = !needle
                    ? items
                    : items.filter((w) => {
                        const hay =
                          `${w.name || ""} ${w.slug || ""} ${w.workspaceId}`.toLowerCase();
                        return hay.includes(needle);
                      });

                  return rows.slice(0, 20).map((w) => ({
                    value: w.workspaceId,
                    label: w.name || w.slug || w.workspaceId,
                  }));
                }}
                onChange={(value) => {
                  const option = toSelectLikeOption(value);
                  const v = option?.value ?? null;
                  const label = option?.label ?? null;
                  if (v) {
                    setWorkspaceOption({ value: String(v), label: String(label || v) });
                  } else {
                    setWorkspaceOption(undefined);
                  }

                  setDraft((prev) => ({
                    ...prev,
                    workspaceId: v ? String(v) : undefined,
                    // workspace 变化时，操作者/对象筛选需要重置（避免跨 workspace 误筛）
                    actorUserId: undefined,
                    subjectUserId: undefined,
                  }));
                  setActorOption(undefined);
                  setSubjectOption(undefined);
                }}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {t("activity:ACTIVITY_FILTER_ACTOR")}
            </div>
            <DebounceSelect
              labelInValue
              value={
                draft.actorUserId
                  ? (actorOption ?? { value: draft.actorUserId, label: draft.actorUserId })
                  : undefined
              }
              allowClear
              disabled={!canPickActorSubject}
              placeholder={
                canPickActorSubject
                  ? t("activity:ACTIVITY_FILTER_ACTOR")
                  : t("activity:ACTIVITY_FILTER_ACTOR_NEED_WORKSPACE")
              }
              fetchOptions={async (search) => {
                if (!selectedWorkspaceId) return [];
                return props.fetchUserOptions(selectedWorkspaceId, search);
              }}
              onChange={(value) => {
                const option = toSelectLikeOption(value);
                const v = option?.value ?? null;
                const label = option?.label ?? null;
                const avatarUrl = option?.avatarUrl ?? option?.data?.avatarUrl ?? null;
                if (v) {
                  setActorOption({ value: String(v), label: String(label || v), avatarUrl });
                } else {
                  setActorOption(undefined);
                }
                setDraft((prev) => ({ ...prev, actorUserId: v ? String(v) : undefined }));
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {t("activity:ACTIVITY_FILTER_SUBJECT")}
            </div>
            <DebounceSelect
              labelInValue
              value={
                draft.subjectUserId
                  ? (subjectOption ?? { value: draft.subjectUserId, label: draft.subjectUserId })
                  : undefined
              }
              allowClear
              disabled={!canPickActorSubject}
              placeholder={t("activity:ACTIVITY_FILTER_SUBJECT")}
              fetchOptions={async (search) => {
                if (!selectedWorkspaceId) return [];
                return props.fetchUserOptions(selectedWorkspaceId, search);
              }}
              onChange={(value) => {
                const option = toSelectLikeOption(value);
                const v = option?.value ?? null;
                const label = option?.label ?? null;
                const avatarUrl = option?.avatarUrl ?? option?.data?.avatarUrl ?? null;
                if (v) {
                  setSubjectOption({ value: String(v), label: String(label || v), avatarUrl });
                } else {
                  setSubjectOption(undefined);
                }
                setDraft((prev) => ({ ...prev, subjectUserId: v ? String(v) : undefined }));
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            onClick={() => {
              setDraft(props.defaultValue);
              setEventNameInput(props.defaultValue.eventName ?? "");
              setEventNameOpen(false);
              setWorkspaceOption(undefined);
              setActorOption(undefined);
              setSubjectOption(undefined);
              if (!props.defaultValue.occurredFrom && !props.defaultValue.occurredTo)
                setRangeValue(null);
            }}
          >
            {t("activity:ACTIVITY_FILTER_RESET")}
          </Button>

          <PopoverClose asChild>
            <Button
              type="primary"
              onClick={() => {
                props.onApply(normalizeFilters(draft));
              }}
            >
              {t("activity:ACTIVITY_FILTER_DONE")}
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
