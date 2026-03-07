import { useQuery } from "@tanstack/react-query";
import { Button, Select } from "antd";
import { Plus } from "lucide-react";

import { listWorkspaceContentModels, type ContentModelSummary } from "@/api/content-models";
import type { ContentViewCreateIn, ContentViewOut } from "@/api/content-views";

import {
  buildLibraryRows,
  type LibraryEntrySource,
  type LibraryRow,
} from "./content-library-table";

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

export const DEFAULT_LIBRARY_VIEW_ID = "__default__";

export function useLibraryModelsQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ["content", "models", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceContentModels(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
}

export function buildPreviewRows(items: readonly unknown[]): LibraryRow[] {
  return buildLibraryRows(items.filter(isLibraryEntrySource));
}

export function filterLibraryModels(items: readonly ContentModelSummary[]): ContentModelSummary[] {
  return items.filter((item) => item.category === "content_library");
}

export function filterLibraryViews(
  items: readonly ContentViewOut[],
  modelKey: string | null,
): ContentViewOut[] {
  if (!modelKey) return [];
  return items.filter((item) => item.enabled && item.typeCode === modelKey);
}

export function buildViewDsl(
  statusFilter: "all" | "draft" | "published",
): ContentViewCreateIn["dsl"] {
  const filters =
    statusFilter === "all" ? [] : ([{ field: "status", op: "eq", value: statusFilter }] as const);
  return {
    filters: [...filters],
    sort: [{ field: "updatedAt", order: "desc" }],
    displayMode: "table",
    limit: 100,
  };
}

export function addProcessingId(
  current: ReadonlySet<string>,
  rowId: string,
  processing: boolean,
): Set<string> {
  const next = new Set(current);
  if (processing) next.add(rowId);
  else next.delete(rowId);
  return next;
}

export function ContentLibraryToolbar(props: {
  libraryModels: readonly ContentModelSummary[];
  onCreateView: () => void;
  onModelChange: (value: string) => void;
  onViewChange: (value: string) => void;
  selectedModel: ContentModelSummary | null;
  selectedViewId: string;
  t: TranslationFn;
  viewOptions: Array<{ label: string; value: string }>;
}) {
  if (!props.selectedModel) return null;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-footnote text-label-secondary">
          {props.t("content_library:LIBRARY_SWITCHER_LABEL")}
        </label>
        <Select
          value={props.selectedModel.key}
          onChange={props.onModelChange}
          options={props.libraryModels.map((item) => ({ value: item.key, label: item.name }))}
          className="min-w-[220px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-footnote text-label-secondary">
          {props.t("content_library:LIBRARY_VIEW_SWITCHER_LABEL")}
        </label>
        <Select
          value={props.selectedViewId}
          onChange={props.onViewChange}
          options={props.viewOptions}
          className="min-w-[220px]"
        />
      </div>
      <Button autoInsertSpace={false} icon={<Plus size={16} />} onClick={props.onCreateView}>
        {props.t("content_library:LIBRARY_VIEW_CREATE_ACTION")}
      </Button>
    </div>
  );
}

function isLibraryEntrySource(value: unknown): value is LibraryEntrySource {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.slug === "string" &&
    typeof row.entryTypeCode === "string" &&
    typeof row.draftRevision === "number"
  );
}
