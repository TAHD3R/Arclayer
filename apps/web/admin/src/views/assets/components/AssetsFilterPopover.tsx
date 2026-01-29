import { Button, DatePicker, Select } from "antd";
import { Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/animate-ui/components/radix/popover";
import type { AdminAssetFolder, AdminAssetTag } from "@/api/assets";

export type AssetsFilters = {
  mimePrefix?: string;
  folderId?: string;
  visibility?: string;
  createdFrom?: string;
  createdTo?: string;
  tagIds?: string[];

  // 预留：当后端支持后，再扩展更多过滤维度
};

function buildFolderPathOptions(folders: AdminAssetFolder[]) {
  const byId = new Map<string, AdminAssetFolder>();
  for (const f of folders) byId.set(f.id, f);

  const memo = new Map<string, string>();
  const buildPath = (id: string, depth = 0): string => {
    const cached = memo.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node) return id;

    // Defensive: avoid infinite loops on corrupted data.
    if (depth > 12) return node.name;

    const parentId = node.parentId ?? undefined;
    if (!parentId) {
      memo.set(id, node.name);
      return node.name;
    }

    const parentLabel = buildPath(parentId, depth + 1);
    const label = parentLabel ? `${parentLabel} / ${node.name}` : node.name;
    memo.set(id, label);
    return label;
  };

  return folders.map((f) => ({ label: buildPath(f.id), value: f.id }));
}

export function AssetsFilterPopover(props: {
  value: AssetsFilters;
  onChange: (next: AssetsFilters) => void;
  folders: AdminAssetFolder[];
  tags: AdminAssetTag[];
  tagsLoading?: boolean;
}) {
  const { t } = useTranslation();
  const [rangeValue, setRangeValue] = useState<any[] | null>(null);

  useEffect(() => {
    // 当外部清空筛选时，内部也要同步清空 RangePicker 的展示。
    if (!props.value.createdFrom && !props.value.createdTo) {
      setRangeValue(null);
    }
  }, [props.value.createdFrom, props.value.createdTo]);

  const mimeOptions = useMemo(
    () => [
      { label: t("assets:ASSET_FILTER_TYPE_ALL"), value: "all" },
      { label: t("assets:ASSET_FILTER_TYPE_IMAGE"), value: "image/" },
      { label: t("assets:ASSET_FILTER_TYPE_VIDEO"), value: "video/" },
      { label: t("assets:ASSET_FILTER_TYPE_AUDIO"), value: "audio/" },
      { label: t("assets:ASSET_FILTER_TYPE_TEXT"), value: "text/" },
      { label: t("assets:ASSET_FILTER_TYPE_APP"), value: "application/" },
    ],
    [t],
  );

  const visibilityOptions = useMemo(
    () => [
      { label: t("assets:ASSET_FILTER_VISIBILITY_ALL"), value: "all" },
      { label: t("assets:ASSET_FILTER_VISIBILITY_PUBLIC"), value: "public" },
      { label: t("assets:ASSET_FILTER_VISIBILITY_PRIVATE"), value: "private" },
      { label: t("assets:ASSET_FILTER_VISIBILITY_SHARED"), value: "shared" },
    ],
    [t],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button icon={<Filter size={16} />} title={t("assets:ASSET_FILTER_TITLE")} />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-[360px] p-3">
        <div className="text-sm font-medium">{t("assets:ASSET_FILTER_TITLE")}</div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-xs text-muted-foreground">
              {t("assets:ASSET_FILTER_FIELD_TYPE")}
            </div>
            <Select
              value={props.value.mimePrefix ?? "all"}
              onChange={(v) =>
                props.onChange({ ...props.value, mimePrefix: v === "all" ? undefined : v })
              }
              options={mimeOptions}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-xs text-muted-foreground">
              {t("assets:ASSET_FILTER_FIELD_FOLDER")}
            </div>
            <Select
              value={props.value.folderId ?? "all"}
              onChange={(v) =>
                props.onChange({ ...props.value, folderId: v === "all" ? undefined : v })
              }
              options={[
                { label: t("assets:ASSET_FILTER_FOLDER_ALL"), value: "all" },
                ...buildFolderPathOptions(props.folders),
              ]}
              showSearch
              optionFilterProp="label"
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-xs text-muted-foreground">
              {t("assets:ASSET_FILTER_FIELD_VISIBILITY")}
            </div>
            <Select
              value={props.value.visibility ?? "all"}
              onChange={(v) =>
                props.onChange({ ...props.value, visibility: v === "all" ? undefined : v })
              }
              options={visibilityOptions}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-xs text-muted-foreground">
              {t("assets:ASSET_FILTER_FIELD_CREATED_AT")}
            </div>
            <DatePicker.RangePicker
              showTime
              allowClear
              value={rangeValue as any}
              onChange={(values) => {
                setRangeValue((values as any) ?? null);
                const start = (values as any)?.[0];
                const end = (values as any)?.[1];
                const createdFrom = start?.toDate
                  ? start.toDate().toISOString()
                  : start?.toISOString?.();
                const createdTo = end?.toDate ? end.toDate().toISOString() : end?.toISOString?.();
                props.onChange({
                  ...props.value,
                  createdFrom: createdFrom || undefined,
                  createdTo: createdTo || undefined,
                });
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-xs text-muted-foreground">
              {t("assets:ASSET_FILTER_FIELD_TAGS")}
            </div>
            <Select
              mode="multiple"
              allowClear
              loading={props.tagsLoading}
              value={props.value.tagIds ?? []}
              onChange={(tagIds) => props.onChange({ ...props.value, tagIds })}
              placeholder={t("assets:ASSET_FILTER_TAGS_PLACEHOLDER")}
              options={props.tags.map((tag) => ({ label: tag.name, value: tag.id }))}
              showSearch
              optionFilterProp="label"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            onClick={() =>
              props.onChange({
                mimePrefix: undefined,
                folderId: undefined,
                visibility: undefined,
                createdFrom: undefined,
                createdTo: undefined,
                tagIds: [],
              })
            }
          >
            {t("assets:ASSET_FILTER_RESET")}
          </Button>

          <PopoverClose asChild>
            <Button type="primary">{t("assets:ASSET_FILTER_DONE")}</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
