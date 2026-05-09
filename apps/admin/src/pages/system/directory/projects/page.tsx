import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef, type Header, type SortingState } from "@tanstack/react-table";
import {
  FunnelX,
  LayoutTemplate,
  ListFilter,
  MoreVertical,
  Palette,
  Pencil,
  Power,
  PowerOff,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { ProjectAvatar } from "@/components/common/project-avatar";
import {
  buildFiltersFromOperatorAwareState,
  buildOperatorAwareFilterState,
  resolveOperatorAwareFieldFilter,
  summarizeOperatorAwareFieldFilter,
  type OperatorAwareFilterState,
} from "@/components/common/reui-filter-state";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import type { SystemDirectoryProject } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Filters, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import {
  ConfirmDirectoryActionDialog,
  DirectoryIconDialog,
  EditProjectDialog,
  type DirectoryIconValues,
} from "../governance-dialogs";
import {
  createActionsColumn,
  createCustomColumn,
  createDateColumn,
  createSelectionColumn,
  createOwnerCell,
  renderCountTag,
  renderTag,
  renderTagWithTooltip,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import {
  useSystemDirectoryProjectGovernance,
  useSystemDirectoryProjectsTable,
  useSystemDirectoryWorkspaceOptions,
} from "../hooks";

type ProjectFilterField = "workspaceId" | "isActive";
type ProjectFilterValue = string;
type ProjectSortValue =
  | "-created_at"
  | "created_at"
  | "name"
  | "-name"
  | "workspace_name"
  | "-workspace_name"
  | "member_count"
  | "-member_count";
type ConfirmActionKind = "disable" | "enable" | "delete";

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;
const DEFAULT_PROJECT_SORT: ProjectSortValue = "-created_at";
const PROJECT_SORT_OPTIONS: ReadonlyArray<{ value: ProjectSortValue; labelKey: string }> = [
  { value: "-created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_NEWEST" },
  { value: "created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_OLDEST" },
  { value: "name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SORT_NAME_AZ" },
  { value: "-name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SORT_NAME_ZA" },
  { value: "workspace_name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_WORKSPACE_AZ" },
  { value: "-member_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_MEMBERS_HIGH" },
] as const;

function toProjectSortValue(sorting: SortingState): ProjectSortValue | null {
  const [first] = sorting;
  if (!first) return null;
  if (first.id === "project") return first.desc ? "-name" : "name";
  if (first.id === "workspace") return first.desc ? "-workspace_name" : "workspace_name";
  if (first.id === "members") return first.desc ? "-member_count" : "member_count";
  if (first.id === "createdAt") return first.desc ? "-created_at" : "created_at";
  return null;
}

function toTableSorting(value: ProjectSortValue): SortingState {
  if (value === "created_at") return [{ id: "createdAt", desc: false }];
  if (value === "name") return [{ id: "project", desc: false }];
  if (value === "-name") return [{ id: "project", desc: true }];
  if (value === "workspace_name") return [{ id: "workspace", desc: false }];
  if (value === "-workspace_name") return [{ id: "workspace", desc: true }];
  if (value === "member_count") return [{ id: "members", desc: false }];
  if (value === "-member_count") return [{ id: "members", desc: true }];
  return [];
}

function toFilters(filters: OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>) {
  return buildFiltersFromOperatorAwareState(filters);
}

function fromFilters(filters: Filter<ProjectFilterValue>[]) {
  return buildOperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>(filters);
}

function firstFilterValue(
  filters: OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>,
  field: ProjectFilterField,
) {
  const value = filters[field]?.values[0];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanFilterValue(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function summarizeProjectFilter(
  filters: OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>,
  field: ProjectFilterField,
  formatValue?: (value: ProjectFilterValue) => string | undefined,
) {
  return summarizeOperatorAwareFieldFilter(resolveOperatorAwareFieldFilter(filters, field), {
    valueFormatter: formatValue,
    maxValues: 1,
  });
}

export function SystemDirectoryProjectsPage() {
  const { t } = useTranslation(["common", "settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const governance = useSystemDirectoryProjectGovernance();
  const [filters, setFilters] = useState<
    OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>
  >({});
  const workspaceOptions = useSystemDirectoryWorkspaceOptions();
  const [editTarget, setEditTarget] = useState<SystemDirectoryProject | null>(null);
  const [iconTarget, setIconTarget] = useState<SystemDirectoryProject | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: ConfirmActionKind;
    projects: SystemDirectoryProject[];
  } | null>(null);
  const resolveFilterLabel = useCallback(
    (field: ProjectFilterField, value: string) => {
      if (field === "workspaceId") {
        return (
          workspaceOptions.workspaces.find((workspace) => workspace.workspaceId === value)?.name ??
          value
        );
      }
      if (field === "isActive") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED");
      }
      return value;
    },
    [t, workspaceOptions.workspaces],
  );

  const columns = useMemo<Array<ColumnDef<SystemDirectoryProject, unknown>>>(
    () => [
      createSelectionColumn<SystemDirectoryProject>(),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECT"),
        (row) => (
          <div className="flex min-w-0 items-center gap-3">
            <ProjectAvatar
              name={row.name}
              size={28}
              iconMode={row.iconMode}
              iconColor={row.iconColor}
              iconGlyph={row.iconGlyph}
              iconEmoji={row.iconEmoji}
              assetRef={row.iconUrl}
            />
            <div className="ml-1 min-w-0">
              {renderTagWithTooltip(row.name, {
                className: "max-w-full",
                textClassName: "max-w-[14rem]",
              })}
            </div>
          </div>
        ),
        { id: "project", sortKey: "name", kind: "primary", size: 300, minSize: 260 },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE"),
        (row) =>
          renderTagWithTooltip(row.workspaceName, {
            tone: "blue",
            icon: LayoutTemplate,
            textClassName: "max-w-[12rem]",
          }),
        { id: "workspace", sortKey: "workspace_name", size: 280, minSize: 240 },
      ),
      createOwnerCell<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER"),
        {
          size: 280,
          minSize: 240,
        },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS"),
        (row) => renderCountTag(row.memberCount),
        { id: "members", sortKey: "member_count" },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS"),
        (row) =>
          renderTag(
            row.isActive
              ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE")
              : t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED"),
            {
              tone: row.isActive ? "green" : "red",
              icon: row.isActive ? ShieldCheck : PowerOff,
            },
          ),
        { id: "state" },
      ),
      createDateColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT"),
        (row) => row.createdAt,
        dateTime,
        { id: "createdAt", sortKey: "created_at" },
      ),
      createActionsColumn<SystemDirectoryProject>({
        size: 72,
        minSize: 72,
        renderActions: (row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_MORE")}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuIconItem
                icon={<Pencil className="size-4" />}
                onSelect={() => setEditTarget(row)}
              >
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_PROJECT")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Palette className="size-4" />}
                onSelect={() => setIconTarget(row)}
              >
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_CHANGE_ICON")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={row.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                variant={row.isActive ? "destructive" : "default"}
                onSelect={() =>
                  setConfirmAction({ kind: row.isActive ? "disable" : "enable", projects: [row] })
                }
              >
                {row.isActive
                  ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT")
                  : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_PROJECT")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={<Trash2 className="size-4" />}
                variant="destructive"
                onSelect={() => setConfirmAction({ kind: "delete", projects: [row] })}
              >
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_PROJECT")}
              </DropdownMenuIconItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ],
    [dateTime, t],
  );

  const extraQuery = useMemo(
    () => ({
      workspaceId: firstFilterValue(filters, "workspaceId"),
      isActive: booleanFilterValue(firstFilterValue(filters, "isActive")),
    }),
    [filters],
  );
  const tableHook = useSystemDirectoryProjectsTable(columns, extraQuery);
  const activeSort = toProjectSortValue(tableHook.sorting) ?? DEFAULT_PROJECT_SORT;
  const filterItems = useMemo(() => toFilters(filters), [filters]);
  const reuiI18n = useMemo(
    () => buildReuiFilterI18n(t, t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_FILTER_TITLE")),
    [t],
  );
  const filterFields = useMemo<FilterFieldConfig<ProjectFilterValue>[]>(
    () => [
      {
        key: "workspaceId",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_WORKSPACE"),
        type: "select",
        icon: <LayoutTemplate className="size-4" />,
        searchable: true,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: workspaceOptions.workspaces.map((workspace) => ({
          value: workspace.workspaceId,
          label: workspace.name,
        })),
      },
      {
        key: "isActive",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_STATE"),
        type: "select",
        icon: <Power className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          { value: "true", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE") },
          { value: "false", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED") },
        ],
      },
    ],
    [t, workspaceOptions.workspaces],
  );

  const resolveColumnFilterAction = useCallback(
    (header: Header<SystemDirectoryProject, unknown>) => {
      if (header.column.id === "workspace") {
        return {
          active: Boolean(filters.workspaceId),
          summary: summarizeProjectFilter(filters, "workspaceId", (value) =>
            resolveFilterLabel("workspaceId", value),
          ),
          onSelect: () => void 0,
        };
      }
      if (header.column.id === "state") {
        return {
          active: Boolean(filters.isActive),
          summary: summarizeProjectFilter(filters, "isActive", (value) =>
            resolveFilterLabel("isActive", value),
          ),
          onSelect: () => void 0,
        };
      }
      return undefined;
    },
    [filters, resolveFilterLabel],
  );
  const hasOverrides = filterItems.length > 0 || activeSort !== DEFAULT_PROJECT_SORT;
  const toolbarLeading = useMemo(
    () => (
      <>
        <Select
          value={activeSort}
          onValueChange={(next) => tableHook.setSorting(toTableSorting(next as ProjectSortValue))}
        >
          <SelectTrigger className="w-[14rem] min-w-[14rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            {PROJECT_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Filters
          filters={filterItems}
          fields={filterFields}
          onChange={(next) => setFilters(fromFilters(next))}
          i18n={reuiI18n}
          allowMultiple={false}
          enableShortcut
          shortcutKey="f"
          shortcutLabel="F"
          trigger={
            <Button variant="outline" disabled={workspaceOptions.isLoading}>
              <ListFilter className="size-4" />
            </Button>
          }
        />
        {hasOverrides ? (
          <Button
            variant="outline"
            onClick={() => {
              setFilters({});
              tableHook.setSorting(toTableSorting(DEFAULT_PROJECT_SORT));
            }}
          >
            <FunnelX className="size-4" />
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_RESET")}
          </Button>
        ) : null}
      </>
    ),
    [
      activeSort,
      filterFields,
      filterItems,
      hasOverrides,
      reuiI18n,
      t,
      tableHook,
      workspaceOptions.isLoading,
    ],
  );

  const selectedProjects = tableHook.table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedActive = selectedProjects.filter((item) => item.isActive);
  const selectedInactive = selectedProjects.filter((item) => !item.isActive);
  const confirmConfig = useMemo(() => {
    if (!confirmAction) return null;
    const count = confirmAction.projects.length;
    if (confirmAction.kind === "disable") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_PROJECT_TITLE"),
        description:
          count > 1
            ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_PROJECT_DESC_MANY")
            : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_PROJECT_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT"),
        variant: "destructive" as const,
      };
    }
    if (confirmAction.kind === "delete") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_PROJECT_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_PROJECT_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_PROJECT"),
        variant: "destructive" as const,
        confirmName: {
          expected: confirmAction.projects[0]?.name ?? "",
          label: t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
          placeholder: t("settings:SETTINGS_PROJECT_DELETE_CONFIRM_NAME_PLACEHOLDER"),
          mismatchMessage: t("settings:SETTINGS_PROJECT_DELETE_CONFIRM_NAME_MISMATCH"),
        },
      };
    }
    return {
      title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_PROJECT_TITLE"),
      description:
        count > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_PROJECT_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_PROJECT_DESC_ONE"),
      confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_PROJECT"),
      variant: "default" as const,
    };
  }, [confirmAction, t]);
  const confirmPending =
    governance.disableProjectsMutation.isPending ||
    governance.enableProjectsMutation.isPending ||
    governance.deleteProjectMutation.isPending;

  return (
    <>
      <SystemDirectoryTable
        tableHook={tableHook}
        text={{
          emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_EMPTY_TITLE"),
          emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_EMPTY_DESC"),
          searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SEARCH"),
        }}
        toolbarLeading={toolbarLeading}
        resolveColumnFilterAction={resolveColumnFilterAction}
        bulkActions={[
          {
            key: "disable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT"),
            icon: <PowerOff className="size-4" />,
            disabled: selectedActive.length === 0,
            onClick: () => setConfirmAction({ kind: "disable", projects: selectedActive }),
          },
          {
            key: "enable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_PROJECT"),
            icon: <ShieldCheck className="size-4" />,
            disabled: selectedInactive.length === 0,
            onClick: () => setConfirmAction({ kind: "enable", projects: selectedInactive }),
          },
        ]}
      />
      <EditProjectDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        project={editTarget}
        pending={governance.updateProjectMutation.isPending}
        onSubmit={async (values) => {
          if (!editTarget) return;
          await governance.updateProjectMutation.mutateAsync({
            projectId: editTarget.projectId,
            name: values.name,
            slug: values.slug,
            description: values.description,
          });
        }}
      />
      <DirectoryIconDialog
        open={Boolean(iconTarget)}
        onOpenChange={(open) => {
          if (!open) setIconTarget(null);
        }}
        kind="project"
        entity={iconTarget}
        pending={governance.updateProjectMutation.isPending}
        onSubmit={async (values: DirectoryIconValues) => {
          if (!iconTarget) return;
          await governance.updateProjectMutation.mutateAsync({
            projectId: iconTarget.projectId,
            ...values,
          });
        }}
      />
      {confirmConfig ? (
        <ConfirmDirectoryActionDialog
          open={Boolean(confirmAction)}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmConfig.title}
          description={confirmConfig.description}
          confirmLabel={confirmConfig.confirmLabel}
          variant={confirmConfig.variant}
          pending={confirmPending}
          confirmName={confirmConfig.confirmName}
          onConfirm={async (values) => {
            if (!confirmAction) return;
            if (confirmAction.kind === "delete") {
              const [project] = confirmAction.projects;
              if (!project) return;
              await governance.deleteProjectMutation.mutateAsync({
                projectId: project.projectId,
                confirmName: values?.confirmName ?? "",
              });
              return;
            }
            const projectIds = confirmAction.projects.map((item) => item.projectId);
            if (confirmAction.kind === "disable") {
              await governance.disableProjectsMutation.mutateAsync({ projectIds });
              return;
            }
            await governance.enableProjectsMutation.mutateAsync({ projectIds });
          }}
        />
      ) : null}
    </>
  );
}
