import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef, type Header, type SortingState } from "@tanstack/react-table";
import {
  Archive,
  FolderKanban,
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
  Undo2,
} from "lucide-react";

import { WorkspaceAvatar } from "@/components/common/entity-avatar";
import {
  buildFiltersFromOperatorAwareState,
  buildOperatorAwareFilterState,
  resolveOperatorAwareFieldFilter,
  summarizeOperatorAwareFieldFilter,
  type OperatorAwareFilterState,
} from "@/components/common/reui-filter-state";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import type { SystemDirectoryWorkspace } from "@arclayer/openapi/admin-types";
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
  EditWorkspaceDialog,
  WorkspaceRoleDialog,
  type DirectoryIconValues,
} from "../governance-dialogs";
import {
  createActionsColumn,
  createCustomColumn,
  createDateColumn,
  createSelectionColumn,
  createTruncatedTextColumn,
  createOwnerCell,
  renderCountTag,
  renderTag,
  renderTagWithTooltip,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import {
  useSystemDirectoryOrganizationOptions,
  useSystemDirectoryWorkspaceGovernance,
  useSystemDirectoryWorkspaceRoleOptions,
  useSystemDirectoryWorkspacesTable,
} from "../hooks";

type WorkspaceFilterField = "organizationId" | "isArchived" | "isActive";
type WorkspaceFilterValue = string;
type WorkspaceSortValue =
  | "-created_at"
  | "created_at"
  | "name"
  | "-name"
  | "organization_name"
  | "-organization_name"
  | "member_count"
  | "-member_count"
  | "project_count"
  | "-project_count";
type ConfirmActionKind = "archive" | "restore" | "disable" | "enable" | "delete";

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;
const DEFAULT_WORKSPACE_SORT: WorkspaceSortValue = "-created_at";
const WORKSPACE_SORT_OPTIONS: ReadonlyArray<{ value: WorkspaceSortValue; labelKey: string }> = [
  { value: "-created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_NEWEST" },
  { value: "created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_OLDEST" },
  { value: "name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_NAME_AZ" },
  { value: "-name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_NAME_ZA" },
  {
    value: "organization_name",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_ORGANIZATION_AZ",
  },
  { value: "-member_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_MEMBERS_HIGH" },
  { value: "member_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_MEMBERS_LOW" },
  { value: "-project_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_PROJECTS_HIGH" },
] as const;

function toWorkspaceSortValue(sorting: SortingState): WorkspaceSortValue | null {
  const [first] = sorting;
  if (!first) return null;
  if (first.id === "workspace") return first.desc ? "-name" : "name";
  if (first.id === "organization") return first.desc ? "-organization_name" : "organization_name";
  if (first.id === "members") return first.desc ? "-member_count" : "member_count";
  if (first.id === "projects") return first.desc ? "-project_count" : "project_count";
  if (first.id === "createdAt") return first.desc ? "-created_at" : "created_at";
  return null;
}

function toTableSorting(value: WorkspaceSortValue): SortingState {
  if (value === "created_at") return [{ id: "createdAt", desc: false }];
  if (value === "name") return [{ id: "workspace", desc: false }];
  if (value === "-name") return [{ id: "workspace", desc: true }];
  if (value === "organization_name") return [{ id: "organization", desc: false }];
  if (value === "-organization_name") return [{ id: "organization", desc: true }];
  if (value === "member_count") return [{ id: "members", desc: false }];
  if (value === "-member_count") return [{ id: "members", desc: true }];
  if (value === "project_count") return [{ id: "projects", desc: false }];
  if (value === "-project_count") return [{ id: "projects", desc: true }];
  return [];
}

function toFilters(filters: OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>) {
  return buildFiltersFromOperatorAwareState(filters);
}

function fromFilters(filters: Filter<WorkspaceFilterValue>[]) {
  return buildOperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>(filters);
}

function firstFilterValue(
  filters: OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>,
  field: WorkspaceFilterField,
) {
  const value = filters[field]?.values[0];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanFilterValue(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function summarizeWorkspaceFilter(
  filters: OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>,
  field: WorkspaceFilterField,
  formatValue?: (value: WorkspaceFilterValue) => string | undefined,
) {
  return summarizeOperatorAwareFieldFilter(resolveOperatorAwareFieldFilter(filters, field), {
    valueFormatter: formatValue,
    maxValues: 1,
  });
}

export function SystemDirectoryWorkspacesPage() {
  const { t } = useTranslation(["common", "settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const governance = useSystemDirectoryWorkspaceGovernance();
  const organizationOptions = useSystemDirectoryOrganizationOptions();
  const [filters, setFilters] = useState<
    OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>
  >({});
  const [editTarget, setEditTarget] = useState<SystemDirectoryWorkspace | null>(null);
  const [iconTarget, setIconTarget] = useState<SystemDirectoryWorkspace | null>(null);
  const [roleTarget, setRoleTarget] = useState<SystemDirectoryWorkspace | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: ConfirmActionKind;
    workspaces: SystemDirectoryWorkspace[];
  } | null>(null);
  const roleOptions = useSystemDirectoryWorkspaceRoleOptions(roleTarget?.workspaceId ?? null);

  const resolveFilterLabel = useCallback(
    (field: WorkspaceFilterField, value: string) => {
      if (field === "organizationId") {
        return (
          organizationOptions.organizations.find(
            (organization) => organization.organizationId === value,
          )?.name ?? value
        );
      }
      if (field === "isArchived") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_ARCHIVED");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE");
      }
      if (field === "isActive") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED");
      }
      return value;
    },
    [organizationOptions.organizations, t],
  );

  const columns = useMemo<Array<ColumnDef<SystemDirectoryWorkspace, unknown>>>(
    () => [
      createSelectionColumn<SystemDirectoryWorkspace>(),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE"),
        (row) => (
          <div className="flex min-w-0 items-center gap-3">
            <WorkspaceAvatar
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
        { id: "workspace", sortKey: "name", kind: "primary", size: 320, minSize: 280 },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION"),
        (row) =>
          renderTagWithTooltip(row.organizationName, {
            tone: "default",
            icon: FolderKanban,
            textClassName: "max-w-[12rem]",
          }),
        { id: "organization", sortKey: "organization_name", size: 280, minSize: 240 },
      ),
      createTruncatedTextColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_DESCRIPTION"),
        (row) => row.description,
        { id: "description", size: 260, minSize: 220 },
      ),
      createOwnerCell<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER"),
        { size: 280, minSize: 240 },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS"),
        (row) => renderCountTag(row.memberCount),
        { id: "members", sortKey: "member_count" },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS"),
        (row) => renderCountTag(row.projectCount),
        { id: "projects", sortKey: "project_count" },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ARCHIVED"),
        (row) =>
          row.isArchived
            ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_ARCHIVED"), {
                tone: "gold",
                icon: Archive,
              })
            : renderTag(
                row.isActive
                  ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE")
                  : t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED"),
                {
                  tone: row.isActive ? "green" : "red",
                  icon: row.isActive ? LayoutTemplate : PowerOff,
                },
              ),
        { id: "state" },
      ),
      createDateColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT"),
        (row) => row.createdAt,
        dateTime,
        { id: "createdAt", sortKey: "created_at" },
      ),
      createActionsColumn<SystemDirectoryWorkspace>({
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
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_WORKSPACE")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Palette className="size-4" />}
                onSelect={() => setIconTarget(row)}
              >
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_CHANGE_ICON")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={<ShieldCheck className="size-4" />}
                onSelect={() => setRoleTarget(row)}
              >
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_MANAGE_ROLES")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={
                  row.isArchived ? <Undo2 className="size-4" /> : <Archive className="size-4" />
                }
                onSelect={() =>
                  setConfirmAction({
                    kind: row.isArchived ? "restore" : "archive",
                    workspaces: [row],
                  })
                }
              >
                {row.isArchived
                  ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESTORE_WORKSPACE")
                  : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_WORKSPACE")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={row.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                variant={row.isActive ? "destructive" : "default"}
                onSelect={() =>
                  setConfirmAction({ kind: row.isActive ? "disable" : "enable", workspaces: [row] })
                }
              >
                {row.isActive
                  ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_WORKSPACE")
                  : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_WORKSPACE")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={<Trash2 className="size-4" />}
                variant="destructive"
                onSelect={() => setConfirmAction({ kind: "delete", workspaces: [row] })}
              >
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_WORKSPACE")}
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
      organizationId: firstFilterValue(filters, "organizationId"),
      isArchived: booleanFilterValue(firstFilterValue(filters, "isArchived")),
      isActive: booleanFilterValue(firstFilterValue(filters, "isActive")),
    }),
    [filters],
  );
  const tableHook = useSystemDirectoryWorkspacesTable(columns, extraQuery);
  const activeSort = toWorkspaceSortValue(tableHook.sorting) ?? DEFAULT_WORKSPACE_SORT;
  const filterItems = useMemo(() => toFilters(filters), [filters]);
  const reuiI18n = useMemo(
    () => buildReuiFilterI18n(t, t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_FILTER_TITLE")),
    [t],
  );
  const filterFields = useMemo<FilterFieldConfig<WorkspaceFilterValue>[]>(
    () => [
      {
        key: "organizationId",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_ORGANIZATION"),
        type: "select",
        icon: <FolderKanban className="size-4" />,
        searchable: true,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: organizationOptions.organizations.map((org) => ({
          value: org.organizationId,
          label: org.name,
        })),
      },
      {
        key: "isArchived",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_ARCHIVE_STATE"),
        type: "select",
        icon: <Archive className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          { value: "true", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ARCHIVED") },
          { value: "false", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE") },
        ],
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
    [organizationOptions.organizations, t],
  );

  const resolveColumnFilterAction = useCallback(
    (header: Header<SystemDirectoryWorkspace, unknown>) => {
      if (header.column.id === "organization") {
        return {
          active: Boolean(filters.organizationId),
          summary: summarizeWorkspaceFilter(filters, "organizationId", (value) =>
            resolveFilterLabel("organizationId", value),
          ),
          onSelect: () => void 0,
        };
      }
      if (header.column.id === "state") {
        if (filters.isArchived) {
          return {
            active: true,
            summary: summarizeWorkspaceFilter(filters, "isArchived", (value) =>
              resolveFilterLabel("isArchived", value),
            ),
            onSelect: () => void 0,
          };
        }
        return {
          active: Boolean(filters.isActive),
          summary: summarizeWorkspaceFilter(filters, "isActive", (value) =>
            resolveFilterLabel("isActive", value),
          ),
          onSelect: () => void 0,
        };
      }
      return undefined;
    },
    [filters, resolveFilterLabel],
  );

  const hasOverrides = filterItems.length > 0 || activeSort !== DEFAULT_WORKSPACE_SORT;
  const toolbarLeading = useMemo(
    () => (
      <>
        <Select
          value={activeSort}
          onValueChange={(next) => tableHook.setSorting(toTableSorting(next as WorkspaceSortValue))}
        >
          <SelectTrigger className="w-[14rem] min-w-[14rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            {WORKSPACE_SORT_OPTIONS.map((option) => (
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
            <Button variant="outline" disabled={organizationOptions.isLoading}>
              <ListFilter className="size-4" />
            </Button>
          }
        />
        {hasOverrides ? (
          <Button
            variant="outline"
            onClick={() => {
              setFilters({});
              tableHook.setSorting(toTableSorting(DEFAULT_WORKSPACE_SORT));
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
      organizationOptions.isLoading,
      reuiI18n,
      t,
      tableHook,
    ],
  );

  const selectedWorkspaces = tableHook.table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedArchived = selectedWorkspaces.filter((item) => item.isArchived);
  const selectedUnarchived = selectedWorkspaces.filter((item) => !item.isArchived);
  const selectedActive = selectedWorkspaces.filter((item) => item.isActive);
  const selectedInactive = selectedWorkspaces.filter((item) => !item.isActive);
  const confirmConfig = useMemo(() => {
    if (!confirmAction) return null;
    const count = confirmAction.workspaces.length;
    const many = count > 1;
    if (confirmAction.kind === "archive") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ARCHIVE_WORKSPACE_TITLE"),
        description: many
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ARCHIVE_WORKSPACE_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ARCHIVE_WORKSPACE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_WORKSPACE"),
        variant: "default" as const,
      };
    }
    if (confirmAction.kind === "restore") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_RESTORE_WORKSPACE_TITLE"),
        description: many
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_RESTORE_WORKSPACE_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_RESTORE_WORKSPACE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESTORE_WORKSPACE"),
        variant: "default" as const,
      };
    }
    if (confirmAction.kind === "disable") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_WORKSPACE_TITLE"),
        description: many
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_WORKSPACE_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_WORKSPACE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_WORKSPACE"),
        variant: "destructive" as const,
      };
    }
    if (confirmAction.kind === "delete") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_WORKSPACE_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_WORKSPACE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_WORKSPACE"),
        variant: "destructive" as const,
        confirmName: {
          expected: confirmAction.workspaces[0]?.name ?? "",
          label: t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
          placeholder: t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_PLACEHOLDER"),
          mismatchMessage: t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"),
        },
      };
    }
    return {
      title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_WORKSPACE_TITLE"),
      description: many
        ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_WORKSPACE_DESC_MANY")
        : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_WORKSPACE_DESC_ONE"),
      confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_WORKSPACE"),
      variant: "default" as const,
    };
  }, [confirmAction, t]);

  const confirmPending =
    governance.archiveWorkspacesMutation.isPending ||
    governance.restoreWorkspacesMutation.isPending ||
    governance.disableWorkspacesMutation.isPending ||
    governance.enableWorkspacesMutation.isPending ||
    governance.deleteWorkspacesMutation.isPending;
  const rolePending =
    governance.updateWorkspaceDefaultRoleMutation.isPending ||
    governance.assignWorkspaceRoleMutation.isPending;

  return (
    <>
      <SystemDirectoryTable
        tableHook={tableHook}
        text={{
          emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_EMPTY_TITLE"),
          emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_EMPTY_DESC"),
          searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SEARCH"),
        }}
        toolbarLeading={toolbarLeading}
        resolveColumnFilterAction={resolveColumnFilterAction}
        bulkActions={[
          {
            key: "archive",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_WORKSPACE"),
            icon: <Archive className="size-4" />,
            disabled: selectedUnarchived.length === 0,
            onClick: () => setConfirmAction({ kind: "archive", workspaces: selectedUnarchived }),
          },
          {
            key: "restore",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESTORE_WORKSPACE"),
            icon: <Undo2 className="size-4" />,
            disabled: selectedArchived.length === 0,
            onClick: () => setConfirmAction({ kind: "restore", workspaces: selectedArchived }),
          },
          {
            key: "disable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_WORKSPACE"),
            icon: <PowerOff className="size-4" />,
            disabled: selectedActive.length === 0,
            onClick: () => setConfirmAction({ kind: "disable", workspaces: selectedActive }),
          },
          {
            key: "enable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_WORKSPACE"),
            icon: <Power className="size-4" />,
            disabled: selectedInactive.length === 0,
            onClick: () => setConfirmAction({ kind: "enable", workspaces: selectedInactive }),
          },
        ]}
      />
      <EditWorkspaceDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        workspace={editTarget}
        pending={governance.updateWorkspaceMutation.isPending}
        onSubmit={async (values) => {
          if (!editTarget) return;
          await governance.updateWorkspaceMutation.mutateAsync({
            workspaceId: editTarget.workspaceId,
            name: values.name,
            description: values.description,
          });
        }}
      />
      <DirectoryIconDialog
        open={Boolean(iconTarget)}
        onOpenChange={(open) => {
          if (!open) setIconTarget(null);
        }}
        kind="workspace"
        entity={iconTarget}
        pending={governance.updateWorkspaceMutation.isPending}
        onSubmit={async (values: DirectoryIconValues) => {
          if (!iconTarget) return;
          await governance.updateWorkspaceMutation.mutateAsync({
            workspaceId: iconTarget.workspaceId,
            ...values,
          });
        }}
      />
      <WorkspaceRoleDialog
        open={Boolean(roleTarget)}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null);
        }}
        workspace={roleTarget}
        roles={roleOptions.roles}
        defaultRoleCode={roleOptions.defaultRoleCode}
        loading={roleOptions.rolesQuery.isLoading || roleOptions.rolePolicyQuery.isLoading}
        pending={rolePending}
        onUpdateDefaultRole={async (roleCode) => {
          if (!roleTarget) return;
          await governance.updateWorkspaceDefaultRoleMutation.mutateAsync({
            workspaceId: roleTarget.workspaceId,
            defaultRoleCode: roleCode,
          });
        }}
        onAssignRole={async (values) => {
          if (!roleTarget) return;
          await governance.assignWorkspaceRoleMutation.mutateAsync({
            workspaceId: roleTarget.workspaceId,
            roleCode: values.roleCode,
            confirmName: values.confirmName,
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
            const workspaceIds = confirmAction.workspaces.map((item) => item.workspaceId);
            if (confirmAction.kind === "archive") {
              await governance.archiveWorkspacesMutation.mutateAsync({ workspaceIds });
              return;
            }
            if (confirmAction.kind === "restore") {
              await governance.restoreWorkspacesMutation.mutateAsync({ workspaceIds });
              return;
            }
            if (confirmAction.kind === "disable") {
              await governance.disableWorkspacesMutation.mutateAsync({ workspaceIds });
              return;
            }
            if (confirmAction.kind === "delete") {
              await governance.deleteWorkspacesMutation.mutateAsync({
                workspaceId: confirmAction.workspaces[0]!.workspaceId,
                confirmName: values?.confirmName ?? "",
              });
              return;
            }
            await governance.enableWorkspacesMutation.mutateAsync({ workspaceIds });
          }}
        />
      ) : null}
    </>
  );
}
