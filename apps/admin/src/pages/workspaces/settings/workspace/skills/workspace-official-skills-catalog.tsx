import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState, Table } from "@tanstack/react-table";
import type { i18n as I18nInstance } from "i18next";
import { useTranslation } from "react-i18next";

import type {
  OfficialSkillCatalogDetailOut,
  OfficialSkillCatalogItemOut,
  SkillInstallationCreateRequest,
} from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { DataTableToolbarTools, useDataTableCore } from "@arclayer/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import {
  WORKSPACE_SKILLS_QUERY_KEY,
  createWorkspaceSkillInstallation,
  getOfficialSkillCatalogPackage,
  listOfficialSkillCatalog,
  updateWorkspaceSkillInstallation,
} from "@/api/workspace-skills";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { BaseTag } from "@/components/ui/tags";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { requiredTranslation } from "@/lib/i18n/required-translation";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import { WorkspaceSkillInstallDialog } from "./workspace-skill-install-dialog";

type StatusFilter = "all" | "enabled" | "disabled";
type SortValue = "name-asc" | "name-desc" | "status-asc" | "status-desc";

export function WorkspaceOfficialSkillsCatalog(props: { workspaceId: string }) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [installDetail, setInstallDetail] = useState<OfficialSkillCatalogDetailOut | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const catalogQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, props.workspaceId, "official", deferredSearch],
    queryFn: ({ signal }) => loadOfficialCatalog(props.workspaceId, deferredSearch, signal),
  });
  const items = useMemo(() => {
    const available = catalogQuery.data ?? [];
    if (statusFilter === "all") return available;
    return available.filter((item) => isEnabled(item) === (statusFilter === "enabled"));
  }, [catalogQuery.data, statusFilter]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: WORKSPACE_SKILLS_QUERY_KEY });
  const installMutation = useMutation({
    mutationFn: (payload: SkillInstallationCreateRequest) =>
      createWorkspaceSkillInstallation(props.workspaceId, payload, crypto.randomUUID()),
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("settings:SETTINGS_WORKSPACE_SKILLS_ENABLED"));
    },
    onError: notifyError,
  });
  const updateMutation = useMutation({
    mutationFn: ({ item, enabled }: { item: OfficialSkillCatalogItemOut; enabled: boolean }) => {
      if (!item.installationId || item.installationMetadataRevision == null) {
        throw new Error("Official Skill installation metadata is missing");
      }
      return updateWorkspaceSkillInstallation(props.workspaceId, item.installationId, {
        enabled,
        expectedRevision: item.installationMetadataRevision,
      });
    },
    onSuccess: async (updated) => {
      await invalidate();
      notifySuccessText(
        t(
          updated.status === "enabled"
            ? "settings:SETTINGS_WORKSPACE_SKILLS_ENABLED"
            : "settings:SETTINGS_WORKSPACE_SKILLS_DISABLED",
        ),
      );
    },
    onError: notifyError,
  });

  async function prepareInstall(item: OfficialSkillCatalogItemOut) {
    setPreparingId(item.packageId);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: [
          ...WORKSPACE_SKILLS_QUERY_KEY,
          props.workspaceId,
          "official-detail",
          item.packageId,
        ],
        queryFn: ({ signal }) =>
          getOfficialSkillCatalogPackage(props.workspaceId, item.packageId, signal),
      });
      setInstallDetail(detail);
      setInstallOpen(true);
    } catch (error) {
      notifyError(error);
    } finally {
      setPreparingId(null);
    }
  }

  const columns = useMemo<ColumnDef<OfficialSkillCatalogItemOut, unknown>[]>(
    () => [
      {
        id: "skill",
        header: t("settings:SETTINGS_WORKSPACE_SKILLS_COLUMN_NAME"),
        accessorFn: (item) => localizedName(item, i18n),
        cell: ({ row }) => (
          <div className="min-w-0 py-1">
            <div className="font-semibold text-label-primary">{localizedName(row.original, i18n)}</div>
            <div className="mt-1 max-w-3xl text-caption leading-5 text-label-secondary">
              {localizedDescription(row.original, i18n)}
            </div>
          </div>
        ),
        meta: { sortKey: "skill" },
        size: 640,
      },
      {
        id: "status",
        header: t("settings:SETTINGS_WORKSPACE_SKILLS_COLUMN_STATUS"),
        accessorFn: (item) => (isEnabled(item) ? "enabled" : "disabled"),
        cell: ({ row }) => {
          const enabled = isEnabled(row.original);
          return (
            <BaseTag color={enabled ? "green" : "default"}>
              {t(
                enabled
                  ? "settings:SETTINGS_WORKSPACE_SKILLS_ENABLED_BADGE"
                  : "settings:SETTINGS_WORKSPACE_SKILLS_DISABLED_BADGE",
              )}
            </BaseTag>
          );
        },
        meta: { sortKey: "status" },
        size: 160,
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        enableSorting: false,
        meta: buildDataTableActionsColumnMeta("right", "right"),
        size: 140,
        cell: ({ row }) => {
          const item = row.original;
          const enabled = isEnabled(item);
          const updating =
            (updateMutation.isPending && updateMutation.variables?.item.packageId === item.packageId) ||
            preparingId === item.packageId;
          return (
            <DataTableActionsCell>
              <Button
                variant="ghost"
                size="sm"
                loading={updating}
                disabled={updating}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!item.installed) {
                    void prepareInstall(item);
                    return;
                  }
                  updateMutation.mutate({ item, enabled: !enabled });
                }}
              >
                {t(
                  enabled
                    ? "settings:SETTINGS_WORKSPACE_SKILLS_DISABLE_ACTION"
                    : "settings:SETTINGS_WORKSPACE_SKILLS_ENABLE_ACTION",
                )}
              </Button>
            </DataTableActionsCell>
          );
        },
      },
    ],
    [i18n, preparingId, t, updateMutation],
  );
  const tableCore = useDataTableCore({
    columns,
    data: items,
    pageCount: 1,
    initialState: { pageSize: 100, sorting: [{ id: "skill", desc: false }] },
    features: {
      sorting: { enabled: true, mode: "client", multiSort: false },
      columnPinning: { enabled: true },
    },
  });
  const toolbar = (
    <OfficialSkillsToolbar
      onRefresh={() => void catalogQuery.refetch()}
      onSearchChange={setSearch}
      onSortChange={(sorting) => tableCore.setSorting(sorting)}
      onStatusChange={setStatusFilter}
      refreshing={catalogQuery.isFetching && !catalogQuery.isPending}
      search={search}
      sorting={tableCore.sorting}
      status={statusFilter}
      table={tableCore.table}
      t={t}
    />
  );

  return (
    <>
      <AdminDataTableSection
        table={tableCore.table}
        toolbar={toolbar}
        emptyText={t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_EMPTY")}
        emptyTitle={t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_EMPTY")}
        emptyDescription={t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_EMPTY_DESC")}
        loading={catalogQuery.isPending}
        error={catalogQuery.error}
        onRetry={() => void catalogQuery.refetch()}
        t={t}
        rowHeight="tall"
        wrapHeaders={false}
      />
      {installDetail ? (
        <WorkspaceSkillInstallDialog
          open={installOpen}
          onOpenChange={setInstallOpen}
          pending={installMutation.isPending}
          packageScope="system"
          version={{
            id: installDetail.versionId,
            packageId: installDetail.packageId,
            versionNumber: installDetail.versionNumber,
            semanticVersion: installDetail.semanticVersion,
            packageChecksum: installDetail.packageChecksum,
            manifest: installDetail.manifest,
          }}
          validation={installDetail.validation}
          onSubmit={(payload) =>
            installMutation.mutateAsync(payload).then(() => setInstallOpen(false))
          }
        />
      ) : null}
    </>
  );
}

function OfficialSkillsToolbar(props: {
  table: Table<OfficialSkillCatalogItemOut>;
  t: (key: string, options?: Record<string, unknown>) => string;
  search: string;
  status: StatusFilter;
  sorting: SortingState;
  refreshing: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  onSortChange: (value: SortingState) => void;
  onRefresh: () => void;
}) {
  const sortValue = sortingToValue(props.sorting);
  return (
    <PageExtraToolbar
      leading={
        <>
          <DataTableSearchInput
            value={props.search}
            onChange={props.onSearchChange}
            placeholder={props.t("settings:SETTINGS_WORKSPACE_SKILLS_SEARCH_PLACEHOLDER")}
            clearLabel={props.t("common:CLEAR")}
          />
          <Select value={props.status} onValueChange={(value) => props.onStatusChange(value as StatusFilter)}>
            <SelectTrigger className="w-40" aria-label={props.t("settings:SETTINGS_WORKSPACE_SKILLS_FILTER_STATUS")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{props.t("settings:SETTINGS_WORKSPACE_SKILLS_FILTER_ALL")}</SelectItem>
              <SelectItem value="enabled">{props.t("settings:SETTINGS_WORKSPACE_SKILLS_ENABLED_BADGE")}</SelectItem>
              <SelectItem value="disabled">{props.t("settings:SETTINGS_WORKSPACE_SKILLS_DISABLED_BADGE")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortValue} onValueChange={(value) => props.onSortChange(valueToSorting(value as SortValue))}>
            <SelectTrigger className="w-44" aria-label={props.t("settings:SETTINGS_WORKSPACE_SKILLS_SORT_LABEL")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">{props.t("settings:SETTINGS_WORKSPACE_SKILLS_SORT_NAME_ASC")}</SelectItem>
              <SelectItem value="name-desc">{props.t("settings:SETTINGS_WORKSPACE_SKILLS_SORT_NAME_DESC")}</SelectItem>
              <SelectItem value="status-desc">{props.t("settings:SETTINGS_WORKSPACE_SKILLS_SORT_ENABLED_FIRST")}</SelectItem>
              <SelectItem value="status-asc">{props.t("settings:SETTINGS_WORKSPACE_SKILLS_SORT_DISABLED_FIRST")}</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
      trailing={
        <DataTableToolbarTools
          table={props.table}
          onRefresh={props.onRefresh}
          refreshing={props.refreshing}
          labels={buildDataTableToolsLabels(props.t)}
        />
      }
    />
  );
}

async function loadOfficialCatalog(workspaceId: string, q: string, signal: AbortSignal) {
  const items: OfficialSkillCatalogItemOut[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listOfficialSkillCatalog(workspaceId, {
      limit: 100,
      ...(cursor ? { cursor } : {}),
      ...(q ? { q } : {}),
      signal,
    });
    items.push(...(page.items ?? []));
    cursor = page.nextCursor ?? undefined;
    if (cursor && seenCursors.has(cursor)) {
      throw new Error("Official Skill catalog returned a repeated cursor");
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return items;
}

function localizedName(item: OfficialSkillCatalogItemOut, i18n: I18nInstance) {
  return item.displayNameKey
    ? requiredTranslation(i18n, `settings:${item.displayNameKey}`, "official Skill name")
    : item.displayName;
}

function localizedDescription(item: OfficialSkillCatalogItemOut, i18n: I18nInstance) {
  return item.descriptionKey
    ? requiredTranslation(i18n, `settings:${item.descriptionKey}`, "official Skill description")
    : item.description;
}

function isEnabled(item: OfficialSkillCatalogItemOut) {
  return item.installed && item.installationStatus === "enabled";
}

function sortingToValue(sorting: SortingState): SortValue {
  const first = sorting[0];
  if (first?.id === "status") return first.desc ? "status-desc" : "status-asc";
  return first?.desc ? "name-desc" : "name-asc";
}

function valueToSorting(value: SortValue): SortingState {
  if (value === "status-asc") return [{ id: "status", desc: false }];
  if (value === "status-desc") return [{ id: "status", desc: true }];
  return [{ id: "skill", desc: value === "name-desc" }];
}
