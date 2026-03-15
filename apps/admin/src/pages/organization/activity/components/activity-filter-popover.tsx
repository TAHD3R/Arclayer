import { Filter, Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { DateTimeRangeField } from "@/components/ui/date-time-range-field";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@celestial/ui/popover";
import { Button } from "@celestial/ui/button";
import { Input } from "@celestial/ui/input";
import {
  DebounceSelect,
  type DebounceSelectOption,
} from "@/pages/organization/activity/components/debounce-select";
import {
  listCatalogEventNames,
  resolveCatalogEntry,
} from "@/pages/organization/activity/constants";

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
  const { t } = useTranslation(["activity", "common"]);

  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ActivityFilters>(() => props.value);

  const [eventNameInput, setEventNameInput] = React.useState<string>(
    () => props.value.eventName ?? "",
  );

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
            <div className="text-footnote font-medium truncate">{title}</div>
            <div className="text-caption text-label-secondary font-mono truncate">{name}</div>
          </div>
        ),
      };
    });
  }, [eventNameInput, t]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          title={t("activity:ACTIVITY_FILTER_TITLE")}
          aria-label={t("activity:ACTIVITY_FILTER_TITLE")}
        >
          <Filter size={18} />
          {t("activity:ACTIVITY_FILTER_TITLE")}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-96 p-3">
        <div className="font-bold">{t("activity:ACTIVITY_FILTER_TITLE")}</div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("activity:ACTIVITY_FIELD_OCCURRED_AT")}
            </div>
            <DateTimeRangeField
              startValue={draft.occurredFrom}
              endValue={draft.occurredTo}
              startAriaLabel={t("activity:ACTIVITY_FIELD_OCCURRED_AT")}
              endAriaLabel={t("activity:ACTIVITY_FIELD_OCCURRED_AT")}
              startPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_START")}
              endPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_END")}
              onChange={({ startValue, endValue }) =>
                setDraft((prev) => ({
                  ...prev,
                  occurredFrom: startValue,
                  occurredTo: endValue,
                }))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("activity:ACTIVITY_FILTER_EVENT_NAME")}
            </div>

            <div className="relative">
              <Input
                list="activity-event-options"
                value={eventNameInput}
                onChange={(event) => {
                  const v = String(event.target.value || "");
                  setEventNameInput(v);
                  setDraft((prev) => ({ ...prev, eventName: v.trim() ? v : undefined }));
                }}
                placeholder={t("activity:ACTIVITY_FILTER_EVENT_NAME_PLACEHOLDER")}
                aria-label={t("activity:ACTIVITY_FILTER_EVENT_NAME")}
                className="pl-9"
              />
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label-secondary" />
              <datalist id="activity-event-options">
                {eventNameOptions.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>
                    {String(option.value)}
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          {props.scope === "org" ? (
            <div className="grid grid-cols-1 gap-1.5">
              <div className="text-footnote text-label-secondary">
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
                emptyText={t("activity:ACTIVITY_FILTER_EMPTY")}
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
                onChange={(option) => {
                  const selectedValue = option?.value ?? null;
                  if (selectedValue) {
                    setWorkspaceOption({
                      value: String(selectedValue),
                      label: option?.label ?? String(selectedValue),
                    });
                  } else {
                    setWorkspaceOption(undefined);
                  }

                  setDraft((prev) => ({
                    ...prev,
                    workspaceId: selectedValue ? String(selectedValue) : undefined,
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
            <div className="text-footnote text-label-secondary">
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
              emptyText={t("activity:ACTIVITY_FILTER_EMPTY")}
              fetchOptions={async (search) => {
                if (!selectedWorkspaceId) return [];
                return props.fetchUserOptions(selectedWorkspaceId, search);
              }}
              onChange={(option) => {
                const selectedValue = option?.value ?? null;
                if (selectedValue) {
                  setActorOption({
                    value: String(selectedValue),
                    label: option?.label ?? String(selectedValue),
                    avatarUrl: option?.avatarUrl ?? null,
                  });
                } else {
                  setActorOption(undefined);
                }
                setDraft((prev) => ({
                  ...prev,
                  actorUserId: selectedValue ? String(selectedValue) : undefined,
                }));
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
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
              emptyText={t("activity:ACTIVITY_FILTER_EMPTY")}
              fetchOptions={async (search) => {
                if (!selectedWorkspaceId) return [];
                return props.fetchUserOptions(selectedWorkspaceId, search);
              }}
              onChange={(option) => {
                const selectedValue = option?.value ?? null;
                if (selectedValue) {
                  setSubjectOption({
                    value: String(selectedValue),
                    label: option?.label ?? String(selectedValue),
                    avatarUrl: option?.avatarUrl ?? null,
                  });
                } else {
                  setSubjectOption(undefined);
                }
                setDraft((prev) => ({
                  ...prev,
                  subjectUserId: selectedValue ? String(selectedValue) : undefined,
                }));
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            onClick={() => {
              setDraft(props.defaultValue);
              setEventNameInput(props.defaultValue.eventName ?? "");
              setWorkspaceOption(undefined);
              setActorOption(undefined);
              setSubjectOption(undefined);
            }}
          >
            {t("activity:ACTIVITY_FILTER_RESET")}
          </Button>

          <PopoverClose asChild>
            <Button
              variant="default"
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
