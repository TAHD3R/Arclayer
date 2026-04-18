import { useEffect, useMemo, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { createWorkspaceProject, listWorkspaceProjects } from "@/api/projects";
import { WorkspaceAvatar } from "@/components/common/entity-avatar";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { ProjectListItem } from "@/types/api";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent } from "@arclayer/ui/card";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";
import {
  DataTableToolbarTools,
  useDataTable,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";

import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";

type ProjectsTab = "active";
type ProjectsViewMode = "card" | "table";
type ProjectCreateFormValues = {
  name: string;
  description: string;
};

const PROJECTS_TABLE_ID = "workspace-projects:active";

function useProjectColumns(t: (key: string, options?: Record<string, unknown>) => string) {
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });

  return useMemo<Array<ColumnDef<ProjectListItem, unknown>>>(
    () => [
      {
        id: "project",
        meta: {
          title: t("account:ACCOUNT_PAGE_PROJECTS_TITLE"),
          sortKey: "name",
          kind: "primary",
        },
        header: t("account:ACCOUNT_PAGE_PROJECTS_TITLE"),
        cell: ({ row }) => {
          const project = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceAvatar
                name={project.name}
                size={42}
                iconMode="initials"
                iconColor="#337ea9"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-headline font-semibold text-label-primary">
                  {project.name}
                </div>
                <div className="mt-1 truncate text-footnote text-label-secondary">
                  {project.description?.trim() ||
                    t("account:ACCOUNT_PROJECTS_DESCRIPTION_FALLBACK")}
                </div>
              </div>
            </div>
          );
        },
        size: 360,
        minSize: 320,
      },
      {
        id: "runtime",
        meta: {
          title: t("account:ACCOUNT_PROJECTS_TABLE_RUNTIME"),
          kind: "meta",
        },
        header: t("account:ACCOUNT_PROJECTS_TABLE_RUNTIME"),
        cell: ({ row }) => (
          <span className="text-label-secondary">
            {row.original.primaryRuntime?.name || t("account:ACCOUNT_PROJECTS_RUNTIME_PRIMARY")}
          </span>
        ),
        size: 180,
        minSize: 160,
      },
    ],
    [dateTime, t],
  );
}

function ProjectCreateDialog(props: {
  open: boolean;
  setOpen: (open: boolean) => void;
  values: ProjectCreateFormValues;
  setValues: (updater: ProjectCreateFormValues) => void;
  pending: boolean;
  onSubmit: (values: ProjectCreateFormValues) => Promise<void>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const nameMissing = !props.values.name.trim();

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.pending) props.setOpen(open);
      }}
      title={props.t("account:ACCOUNT_PROJECTS_CREATE_TITLE")}
      description={props.t("account:ACCOUNT_PROJECTS_CREATE_DESC")}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" disabled={props.pending} onClick={() => props.setOpen(false)}>
            {props.t("common:CANCEL")}
          </Button>
          <Button
            loading={props.pending}
            disabled={nameMissing}
            onClick={() => void props.onSubmit(props.values)}
          >
            {props.t("account:ACCOUNT_PROJECTS_CREATE_ACTION")}
          </Button>
        </div>
      }
    >
      <SettingDialogField
        title={props.t("account:ACCOUNT_PROJECTS_FIELD_NAME")}
        description={props.t("account:ACCOUNT_PROJECTS_FIELD_NAME_DESC")}
      >
        <Input
          value={props.values.name}
          onChange={(event) =>
            props.setValues({
              ...props.values,
              name: event.target.value,
            })
          }
          placeholder={props.t("account:ACCOUNT_PROJECTS_FIELD_NAME_PLACEHOLDER")}
          disabled={props.pending}
        />
      </SettingDialogField>

      <SettingDialogField
        title={props.t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION")}
        description={props.t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_DESC")}
      >
        <Input
          value={props.values.description}
          onChange={(event) =>
            props.setValues({
              ...props.values,
              description: event.target.value,
            })
          }
          placeholder={props.t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_PLACEHOLDER")}
          disabled={props.pending}
        />
      </SettingDialogField>
    </SettingDialog>
  );
}

function ProjectCard(props: {
  project: ProjectListItem;
  onOpen: (project: ProjectListItem) => void;
  onManage: (project: ProjectListItem) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div
      className="col-span-1 flex cursor-pointer flex-col rounded-lg border border-border bg-card p-4 transition-colors duration-200 hover:border-border/80 hover:bg-accent/50"
      onClick={() => props.onOpen(props.project)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <WorkspaceAvatar
          name={props.project.name}
          size={40}
          iconMode="initials"
          iconColor="#337ea9"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            props.onManage(props.project);
          }}
        >
          {props.t("account:ACCOUNT_PROJECTS_MANAGE_ACTION")}
        </Button>
      </div>

      <div className="flex flex-col">
        <div className="truncate text-headline font-semibold text-label-primary">
          {props.project.name}
        </div>
        <div className="mt-1 line-clamp-2 text-footnote text-label-secondary">
          {props.project.description?.trim() ||
            props.t("account:ACCOUNT_PROJECTS_DESCRIPTION_FALLBACK")}
        </div>
      </div>

      <div className="mt-auto pt-4 text-footnote text-label-secondary">
        {props.project.primaryRuntime?.name || props.t("account:ACCOUNT_PROJECTS_RUNTIME_PRIMARY")}
      </div>
    </div>
  );
}

export function WorkspacesPage() {
  const { create } = useSearch({ from: "/projects/" });
  const autoOpenCreate = create === "1";
  const { t } = useTranslation(["account", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId =
    useWorkspaceStore((state) => state.currentWorkspaceId) ??
    useWorkspaceStore((state) => state.lastWorkspaceId);

  const [tab, setTab] = useState<ProjectsTab>("active");
  const [viewMode, setViewMode] = useState<ProjectsViewMode>("card");
  const [searchInput, setSearchInput] = useState("");
  const [createOpen, setCreateOpen] = useState(autoOpenCreate);
  const [createValues, setCreateValues] = useState<ProjectCreateFormValues>({
    name: "",
    description: "",
  });

  useEffect(() => {
    if (autoOpenCreate) setCreateOpen(true);
  }, [autoOpenCreate]);

  const columns = useProjectColumns(t);
  const projectsTable = useDataTable<ProjectListItem>({
    tableId: PROJECTS_TABLE_ID,
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) => {
      if (!workspaceId) {
        return {
          items: [],
          total: 0,
          page: params.page,
          size: params.size,
          pages: 0,
          next: null,
          prev: null,
        };
      }
      return listWorkspaceProjects(workspaceId, {
        page: params.page,
        size: params.size,
        q: params.q,
      });
    },
    queryOptions: {
      enabled: Boolean(workspaceId),
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });
  const toolsLabels = buildDataTableToolsLabels(t);
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId: PROJECTS_TABLE_ID });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({
    tableId: PROJECTS_TABLE_ID,
  });

  const createMutation = useMutation({
    mutationFn: async (values: ProjectCreateFormValues) => {
      if (!workspaceId) {
        throw new Error("WORKSPACE_NOT_SELECTED");
      }
      return createWorkspaceProject(workspaceId, {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
      });
    },
    onSuccess: async (detail) => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: ["dataTable", PROJECTS_TABLE_ID],
        exact: false,
      });
      setCreateOpen(false);
      setCreateValues({ name: "", description: "" });
      useWorkspaceStore.getState().setCurrentProjectId(detail.project.id);
      void navigate({ to: projectHomePath(detail.project.id) as never });
    },
    onError: (error) => notifyError(error),
  });

  const filteredCardItems = useMemo(() => {
    const needle = searchInput.trim().toLowerCase();
    const items = projectsTable.items;
    if (!needle) return items;
    return items.filter((project) =>
      [project.name, project.description, project.slug]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [projectsTable.items, searchInput]);

  const handleOpenProject = (project: ProjectListItem) => {
    useWorkspaceStore.getState().setCurrentProjectId(project.id);
    if (workspaceId) {
      useWorkspaceStore.getState().setCurrentWorkspaceId(workspaceId);
    }
    void navigate({ to: projectHomePath(project.id) as never });
  };

  const handleManageProject = (project: ProjectListItem) => {
    useWorkspaceStore.getState().setCurrentProjectId(project.id);
    if (workspaceId) {
      useWorkspaceStore.getState().setCurrentWorkspaceId(workspaceId);
    }
    void navigate({ to: `/projects/${project.id}/settings/general/` as never });
  };

  const pageToolbar = (
    <PageExtraToolbar
      className="items-center"
      leading={
        <ChromeTabsList className="w-auto">
          <ChromeTabsTrigger value="active">
            {t("account:ACCOUNT_PROJECTS_TAB_ACTIVE")}
          </ChromeTabsTrigger>
        </ChromeTabsList>
      }
      trailing={
        <>
          {viewMode === "table" ? (
            <DataTableToolbarTools
              table={projectsTable.table}
              rowHeight={rowHeight}
              onRowHeightChange={setRowHeight}
              wrapHeaders={wrapHeaders}
              onWrapHeadersChange={setWrapHeaders}
              onRefresh={() => void projectsTable.refetch()}
              refreshing={projectsTable.isFetching}
              onResetColumnVisibility={projectsTable.resetColumnVisibility}
              labels={toolsLabels}
              components={{ IconButton: DataTableToolbarAntdIconButton }}
            />
          ) : null}

          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-1">
            <Button
              variant={viewMode === "card" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("card")}
            >
              {t("common:VIEW_CARD")}
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
            >
              {t("common:VIEW_TABLE")}
            </Button>
          </div>

          <DataTableSearchInput
            value={searchInput}
            onChange={(value) => {
              setSearchInput(value);
              projectsTable.setSearchInput(value);
            }}
            placeholder={t("account:ACCOUNT_PROJECTS_SEARCH_PLACEHOLDER")}
            clearLabel={t("common:CLEAR")}
          />
        </>
      }
    />
  );

  const createButton = (
    <Button variant="default" onClick={() => setCreateOpen(true)} disabled={!workspaceId}>
      <Plus size={16} />
      {t("account:ACCOUNT_PROJECTS_CREATE_ACTION")}
    </Button>
  );

  return (
    <ChromeTabs value={tab} onValueChange={() => setTab("active")}>
      <DefaultPage
        title={t("account:ACCOUNT_PAGE_PROJECTS_TITLE")}
        description={t("account:ACCOUNT_PAGE_PROJECTS_DESC")}
        contentClassName="min-h-0 flex flex-col"
        showFavoriteToggle={false}
        action={createButton}
        extra={pageToolbar}
      >
        {!workspaceId ? (
          <Card className="max-w-3xl">
            <CardContent className="pt-6 text-body text-label-secondary">
              {t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
            </CardContent>
          </Card>
        ) : viewMode === "card" ? (
          <ChromeTabsContent value="active" className="min-h-0 flex-1">
            {filteredCardItems.length === 0 ? (
              <Card className="max-w-3xl">
                <CardContent className="flex flex-col items-start gap-4 pt-6">
                  <div>
                    <div className="text-headline font-semibold text-label-primary">
                      {t("account:ACCOUNT_PROJECTS_EMPTY_TITLE")}
                    </div>
                    <div className="mt-1 text-body text-label-secondary">
                      {t("account:ACCOUNT_PROJECTS_EMPTY_DESC")}
                    </div>
                  </div>
                  {createButton}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredCardItems.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onOpen={handleOpenProject}
                    onManage={handleManageProject}
                    t={t}
                  />
                ))}
              </div>
            )}
          </ChromeTabsContent>
        ) : (
          <ChromeTabsContent value="active" className="min-h-0 flex-1">
            <AdminDataTableSection
              table={projectsTable.table}
              emptyText={t("common:EMPTY_DESC")}
              emptyTitle={t("account:ACCOUNT_PROJECTS_EMPTY_TITLE")}
              emptyDescription={t("account:ACCOUNT_PROJECTS_EMPTY_DESC")}
              emptyExtra={createButton}
              loading={projectsTable.isLoading}
              error={projectsTable.error}
              onRetry={() => void projectsTable.refetch()}
              pageData={projectsTable.pageData}
              onPaginationChange={(nextPage, nextSize) => {
                if (nextSize !== projectsTable.table.getState().pagination.pageSize) {
                  projectsTable.table.setPageSize(nextSize);
                }
                projectsTable.table.setPageIndex(Math.max(0, nextPage - 1));
              }}
              t={t}
              rowHeight={rowHeight}
              wrapHeaders={wrapHeaders}
              refreshing={projectsTable.isFetching && !projectsTable.isLoading}
              onRowClick={(row) => handleOpenProject(row.original)}
            />
          </ChromeTabsContent>
        )}
      </DefaultPage>

      <ProjectCreateDialog
        open={createOpen}
        setOpen={setCreateOpen}
        values={createValues}
        setValues={setCreateValues}
        pending={createMutation.isPending}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
        t={t}
      />
    </ChromeTabs>
  );
}
