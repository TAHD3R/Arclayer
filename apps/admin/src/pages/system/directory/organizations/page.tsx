import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef, type Header, type SortingState } from "@tanstack/react-table";
import {
  Building2,
  CircleUserRound,
  FunnelX,
  ListFilter,
  MoreVertical,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  UserRoundCog,
} from "lucide-react";

import { listSystemDirectoryUsers } from "@/api/system-directory";
import {
  buildFiltersFromOperatorAwareState,
  buildOperatorAwareFilterState,
  resolveOperatorAwareFieldFilter,
  summarizeOperatorAwareFieldFilter,
  type OperatorAwareFilterState,
} from "@/components/common/reui-filter-state";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import type { SystemDirectoryOrganization } from "@/types/api/system-directory";
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
  AssignOrganizationOwnerDialog,
  ConfirmDirectoryActionDialog,
  EditOrganizationDialog,
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
  useSystemDirectoryOrganizationGovernance,
  useSystemDirectoryOrganizationsTable,
} from "../hooks";

type OrganizationFilterField = "kind" | "isActive";
type OrganizationFilterValue = string;
type OrganizationSortValue =
  | "-created_at"
  | "created_at"
  | "name"
  | "-name"
  | "kind"
  | "-kind"
  | "member_count"
  | "-member_count"
  | "workspace_count"
  | "-workspace_count"
  | "project_count"
  | "-project_count";
type ConfirmActionKind = "disable" | "enable" | "delete";

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;
const DEFAULT_ORGANIZATION_SORT: OrganizationSortValue = "-created_at";

const ORGANIZATION_SORT_OPTIONS: ReadonlyArray<{
  value: OrganizationSortValue;
  labelKey: string;
}> = [
  { value: "-created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_NEWEST" },
  { value: "created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_OLDEST" },
  { value: "name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_SORT_NAME_AZ" },
  { value: "-name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_SORT_NAME_ZA" },
  { value: "kind", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_SORT_KIND_AZ" },
  { value: "-kind", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_SORT_KIND_ZA" },
  { value: "-member_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_MEMBERS_HIGH" },
  { value: "member_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_MEMBERS_LOW" },
  {
    value: "-workspace_count",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_WORKSPACES_HIGH",
  },
  { value: "-project_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_PROJECTS_HIGH" },
] as const;

function toOrganizationSortValue(sorting: SortingState): OrganizationSortValue | null {
  const [first] = sorting;
  if (!first) return null;
  if (first.id === "organization") return first.desc ? "-name" : "name";
  if (first.id === "kind") return first.desc ? "-kind" : "kind";
  if (first.id === "members") return first.desc ? "-member_count" : "member_count";
  if (first.id === "workspaces") return first.desc ? "-workspace_count" : "workspace_count";
  if (first.id === "projects") return first.desc ? "-project_count" : "project_count";
  if (first.id === "createdAt") return first.desc ? "-created_at" : "created_at";
  return null;
}

function toTableSorting(value: OrganizationSortValue): SortingState {
  if (value === "created_at") return [{ id: "createdAt", desc: false }];
  if (value === "name") return [{ id: "organization", desc: false }];
  if (value === "-name") return [{ id: "organization", desc: true }];
  if (value === "kind") return [{ id: "kind", desc: false }];
  if (value === "-kind") return [{ id: "kind", desc: true }];
  if (value === "member_count") return [{ id: "members", desc: false }];
  if (value === "-member_count") return [{ id: "members", desc: true }];
  if (value === "workspace_count") return [{ id: "workspaces", desc: false }];
  if (value === "-workspace_count") return [{ id: "workspaces", desc: true }];
  if (value === "project_count") return [{ id: "projects", desc: false }];
  if (value === "-project_count") return [{ id: "projects", desc: true }];
  return [];
}

function toFilters(
  filters: OperatorAwareFilterState<OrganizationFilterField, OrganizationFilterValue>,
) {
  return buildFiltersFromOperatorAwareState(filters);
}

function fromFilters(filters: Filter<OrganizationFilterValue>[]) {
  return buildOperatorAwareFilterState<OrganizationFilterField, OrganizationFilterValue>(filters);
}

function firstFilterValue(
  filters: OperatorAwareFilterState<OrganizationFilterField, OrganizationFilterValue>,
  field: OrganizationFilterField,
) {
  const value = filters[field]?.values[0];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanFilterValue(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function SystemDirectoryOrganizationsPage() {
  const { t } = useTranslation(["common", "settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const governance = useSystemDirectoryOrganizationGovernance();
  const [filters, setFilters] = useState<
    OperatorAwareFilterState<OrganizationFilterField, OrganizationFilterValue>
  >({});
  const [editTarget, setEditTarget] = useState<SystemDirectoryOrganization | null>(null);
  const [ownerTarget, setOwnerTarget] = useState<SystemDirectoryOrganization | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: ConfirmActionKind;
    organizations: SystemDirectoryOrganization[];
  } | null>(null);

  const resolveFilterLabel = useCallback(
    (field: OrganizationFilterField, value: string) => {
      if (field === "kind") {
        if (value === "personal") return t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_PERSONAL");
        if (value === "team") return t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_TEAM");
      }
      if (field === "isActive") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED");
      }
      return value;
    },
    [t],
  );

  const columns = useMemo<Array<ColumnDef<SystemDirectoryOrganization, unknown>>>(
    () => [
      createSelectionColumn<SystemDirectoryOrganization>(),
      createTruncatedTextColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION"),
        (row) => row.name,
        { id: "organization", sortKey: "name", kind: "primary", size: 320, minSize: 280 },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION_ID"),
        (row) =>
          renderTagWithTooltip(row.organizationId, {
            tone: "default",
            textClassName: "max-w-[14rem]",
            tooltipClassName: "max-w-[28rem]",
          }),
        { id: "organizationId", size: 260, minSize: 220 },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_KIND"),
        (row) =>
          row.kind === "personal"
            ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_PERSONAL"), {
                tone: "blue",
                icon: CircleUserRound,
              })
            : renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_TEAM"), {
                tone: "default",
                icon: Building2,
              }),
        { id: "kind", sortKey: "kind" },
      ),
      createOwnerCell<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER"),
        { size: 280, minSize: 240 },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS"),
        (row) => renderCountTag(row.memberCount),
        { id: "members", sortKey: "member_count" },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACES"),
        (row) => renderCountTag(row.workspaceCount),
        { id: "workspaces", sortKey: "workspace_count" },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS"),
        (row) => renderCountTag(row.projectCount),
        { id: "projects", sortKey: "project_count" },
      ),
      createDateColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT"),
        (row) => row.createdAt,
        dateTime,
        { id: "createdAt", sortKey: "created_at" },
      ),
      createActionsColumn<SystemDirectoryOrganization>({
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
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ORGANIZATION")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={<UserRoundCog className="size-4" />}
                onSelect={() => setOwnerTarget(row)}
              >
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ASSIGN_OWNER")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={row.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                variant={row.isActive ? "destructive" : "default"}
                onSelect={() =>
                  setConfirmAction({
                    kind: row.isActive ? "disable" : "enable",
                    organizations: [row],
                  })
                }
              >
                {row.isActive
                  ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ORGANIZATION")
                  : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ORGANIZATION")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={<Trash2 className="size-4" />}
                variant="destructive"
                onSelect={() => setConfirmAction({ kind: "delete", organizations: [row] })}
              >
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ORGANIZATION")}
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
      kind: firstFilterValue(filters, "kind"),
      isActive: booleanFilterValue(firstFilterValue(filters, "isActive")),
    }),
    [filters],
  );
  const tableHook = useSystemDirectoryOrganizationsTable(columns, extraQuery);
  const activeSort = toOrganizationSortValue(tableHook.sorting) ?? DEFAULT_ORGANIZATION_SORT;
  const filterItems = useMemo(() => toFilters(filters), [filters]);
  const reuiI18n = useMemo(
    () =>
      buildReuiFilterI18n(t, t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_FILTER_TITLE")),
    [t],
  );
  const filterFields = useMemo<FilterFieldConfig<OrganizationFilterValue>[]>(
    () => [
      {
        key: "kind",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_ORGANIZATION_KIND"),
        type: "select",
        icon: <Building2 className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          { value: "personal", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_PERSONAL") },
          { value: "team", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_TEAM") },
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
    [t],
  );

  const resolveColumnFilterAction = useCallback(
    (header: Header<SystemDirectoryOrganization, unknown>) => {
      if (header.column.id === "kind") {
        return {
          active: Boolean(filters.kind),
          summary: summarizeOperatorAwareFieldFilter(
            resolveOperatorAwareFieldFilter(filters, "kind"),
            {
              valueFormatter: (value) => resolveFilterLabel("kind", value),
              maxValues: 1,
            },
          ),
          onSelect: () => void 0,
        };
      }
      return undefined;
    },
    [filters, resolveFilterLabel],
  );

  const hasOverrides = filterItems.length > 0 || activeSort !== DEFAULT_ORGANIZATION_SORT;
  const toolbarLeading = useMemo(
    () => (
      <>
        <Select
          value={activeSort}
          onValueChange={(next) =>
            tableHook.setSorting(toTableSorting(next as OrganizationSortValue))
          }
        >
          <SelectTrigger className="w-[14rem] min-w-[14rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            {ORGANIZATION_SORT_OPTIONS.map((option) => (
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
            <Button variant="outline">
              <ListFilter className="size-4" />
            </Button>
          }
        />
        {hasOverrides ? (
          <Button
            variant="outline"
            onClick={() => {
              setFilters({});
              tableHook.setSorting(toTableSorting(DEFAULT_ORGANIZATION_SORT));
            }}
          >
            <FunnelX className="size-4" />
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_RESET")}
          </Button>
        ) : null}
      </>
    ),
    [activeSort, filterFields, filterItems, hasOverrides, reuiI18n, t, tableHook],
  );

  const selectedOrganizations = tableHook.table
    .getSelectedRowModel()
    .rows.map((row) => row.original);
  const selectedActive = selectedOrganizations.filter((item) => item.isActive);
  const selectedInactive = selectedOrganizations.filter((item) => !item.isActive);
  const selectedDeletable = selectedOrganizations;
  const confirmConfig = useMemo(() => {
    if (!confirmAction) return null;
    const count = confirmAction.organizations.length;
    const many = count > 1;
    if (confirmAction.kind === "disable") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_ORGANIZATION_TITLE"),
        description:
          count > 1
            ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_ORGANIZATION_DESC_MANY")
            : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_ORGANIZATION_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ORGANIZATION"),
        variant: "destructive" as const,
      };
    }
    if (confirmAction.kind === "delete") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_ORGANIZATION_TITLE"),
        description: many
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_ORGANIZATION_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_ORGANIZATION_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ORGANIZATION"),
        variant: "destructive" as const,
        confirmName: many
          ? undefined
          : {
              expected: confirmAction.organizations[0]?.name ?? "",
              label: t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
              placeholder: t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_PLACEHOLDER"),
              mismatchMessage: t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_MISMATCH"),
            },
      };
    }
    return {
      title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_ORGANIZATION_TITLE"),
      description:
        count > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_ORGANIZATION_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_ORGANIZATION_DESC_ONE"),
      confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ORGANIZATION"),
      variant: "default" as const,
    };
  }, [confirmAction, t]);

  const confirmPending =
    governance.disableOrganizationsMutation.isPending ||
    governance.enableOrganizationsMutation.isPending ||
    governance.deleteOrganizationsMutation.isPending;

  return (
    <>
      <SystemDirectoryTable
        tableHook={tableHook}
        text={{
          emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_EMPTY_TITLE"),
          emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_EMPTY_DESC"),
          searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_SEARCH"),
        }}
        toolbarLeading={toolbarLeading}
        resolveColumnFilterAction={resolveColumnFilterAction}
        bulkActions={[
          {
            key: "disable-organizations",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ORGANIZATION"),
            disabled: selectedActive.length === 0,
            onClick: () => setConfirmAction({ kind: "disable", organizations: selectedActive }),
          },
          {
            key: "enable-organizations",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ORGANIZATION"),
            disabled: selectedInactive.length === 0,
            onClick: () => setConfirmAction({ kind: "enable", organizations: selectedInactive }),
          },
          {
            key: "delete-organizations",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ORGANIZATION"),
            disabled: selectedDeletable.length === 0,
            onClick: () => setConfirmAction({ kind: "delete", organizations: selectedDeletable }),
          },
        ]}
      />
      <EditOrganizationDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        organization={editTarget}
        pending={governance.updateOrganizationMutation.isPending}
        onSubmit={async (values) => {
          if (!editTarget) return;
          await governance.updateOrganizationMutation.mutateAsync({
            organizationId: editTarget.organizationId,
            name: values.name,
          });
        }}
      />
      <AssignOrganizationOwnerDialog
        open={Boolean(ownerTarget)}
        onOpenChange={(open) => {
          if (!open) setOwnerTarget(null);
        }}
        organization={ownerTarget}
        fetchUsers={async (search) => {
          const page = await listSystemDirectoryUsers({
            page: 1,
            size: 20,
            q: search,
            ordering: "username",
          });
          return page.items;
        }}
        pending={governance.updateOrganizationMutation.isPending}
        onSubmit={async (values) => {
          if (!ownerTarget) return;
          await governance.updateOrganizationMutation.mutateAsync({
            organizationId: ownerTarget.organizationId,
            ownerUserId: values.ownerUserId,
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
            if (confirmAction.kind === "disable") {
              const organizationIds = confirmAction.organizations.map(
                (item) => item.organizationId,
              );
              await governance.disableOrganizationsMutation.mutateAsync({ organizationIds });
              return;
            }
            if (confirmAction.kind === "delete") {
              await governance.deleteOrganizationsMutation.mutateAsync({
                organizations: confirmAction.organizations.map((organization) => ({
                  organizationId: organization.organizationId,
                  confirmName:
                    confirmAction.organizations.length > 1
                      ? organization.name
                      : (values?.confirmName ?? organization.name),
                })),
              });
              return;
            }
            const organizationIds = confirmAction.organizations.map((item) => item.organizationId);
            await governance.enableOrganizationsMutation.mutateAsync({ organizationIds });
          }}
        />
      ) : null}
    </>
  );
}
