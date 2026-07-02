import { useCallback, useEffect, useState } from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Button } from "@arclayer/ui/button";
import { ChromeTabs, ChromeTabsContent } from "@arclayer/ui/chrome-tabs";
import {
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";

import { ProjectIconDialog } from "./components/project-icon-dialog";
import { ProjectActionDialogs } from "./components/usercenter-projects-dialogs";
import { ProjectsCreateCard } from "./components/projects-create-card";
import { UserCenterProjectsToolbar } from "./components/usercenter-projects-toolbar";
import { ProjectsContentSection } from "./components/projects-content-section";
import { useUserCenterProjectsColumns } from "./components/projects-columns";
import { useProjectMenuActions } from "./hooks/use-project-menu-actions";
import { useUserCenterProjectsTables } from "./hooks/use-usercenter-projects-tables";
import type {
  UserCenterProjectsTab,
  UserCenterProjectsTranslateFn,
  UserCenterProjectsViewMode,
} from "./types";
import type { UserCenterProjectListItem } from "./project-list-items";

export function ProjectsPage() {
  const { create } = useSearch({ from: "/projects/" });
  const autoOpenCreate = create === "1";

  const { t } = useTranslation(["account", "common", "ai"]);
  const projectT = useCallback<UserCenterProjectsTranslateFn>(
    (key, options) => t(key, options),
    [t],
  );
  const navigate = useNavigate();
  const currentWorkspaceIdFromStore = useWorkspaceStore((state) => state.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const currentWorkspaceId = currentWorkspaceIdFromStore ?? lastWorkspaceId;
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const setCurrentProjectId = useWorkspaceStore((state) => state.setCurrentProjectId);

  const [tab, setTab] = useState<UserCenterProjectsTab>("active");
  const [viewMode, setViewMode] = useState<UserCenterProjectsViewMode>("card");
  const openCreateProjectWithAI = useCallback(
    (replace = false) => {
      void navigate({
        to: "/" as never,
        search: { prompt: t("ai:AI_CHAT_CREATE_PROJECT_PROMPT") } as never,
        replace,
      });
    },
    [navigate, t],
  );

  useEffect(() => {
    if (!autoOpenCreate) return;
    openCreateProjectWithAI(true);
  }, [autoOpenCreate, openCreateProjectWithAI]);

  const handleEnterProject = useCallback(
    (project: UserCenterProjectListItem) => {
      setCurrentWorkspaceId(project.workspaceId);
      setCurrentProjectId(project.projectId);
      void navigate({ to: projectHomePath(project.projectId) as never });
    },
    [navigate, setCurrentProjectId, setCurrentWorkspaceId],
  );

  const handleManageProject = useCallback(
    (project: UserCenterProjectListItem) => {
      setCurrentWorkspaceId(project.workspaceId);
      setCurrentProjectId(project.projectId);
      void navigate({ to: `/projects/${project.projectId}/settings/general/` as never });
    },
    [navigate, setCurrentProjectId, setCurrentWorkspaceId],
  );

  const handleOpenCreate = useCallback(() => {
    openCreateProjectWithAI();
  }, [openCreateProjectWithAI]);

  const projectMenuActions = useProjectMenuActions({
    workspaceId: currentWorkspaceId ?? undefined,
    t: projectT,
    onEnterProject: handleEnterProject,
    onManageProject: handleManageProject,
  });
  const handlePrepareProjectMenu = useCallback(
    (projectId: string) => {
      projectMenuActions.prepareProjectDangerCapabilities(projectId);
    },
    [projectMenuActions.prepareProjectDangerCapabilities],
  );

  const columns = useUserCenterProjectsColumns({
    t: projectT,
    buildMenuItems: projectMenuActions.buildMenuItems,
    onPrepareProjectMenu: handlePrepareProjectMenu,
    editingProjectId: projectMenuActions.editingProjectId,
    editingProjectField: projectMenuActions.editingProjectField,
    editingProjectName: projectMenuActions.editingProjectName,
    editingProjectDescription: projectMenuActions.editingProjectDescription,
    onEditingProjectNameChange: projectMenuActions.setEditingProjectName,
    onEditingProjectDescriptionChange: projectMenuActions.setEditingProjectDescription,
    onCommitProjectEdit: projectMenuActions.commitProjectEdit,
    onCancelProjectEdit: projectMenuActions.cancelProjectEdit,
  });

  const { activeTableId, archivedTableId, activeTableHook, archivedTableHook } =
    useUserCenterProjectsTables({
      workspaceId: currentWorkspaceId ?? undefined,
      columns,
    });

  const toolsLabels = buildDataTableToolsLabels(t);
  const [activeRowHeight, setActiveRowHeight] = useDataTableRowHeightPreference({
    tableId: activeTableId,
  });
  const [activeWrapHeaders, setActiveWrapHeaders] = useDataTableWrapHeadersPreference({
    tableId: activeTableId,
  });
  const [archivedRowHeight, setArchivedRowHeight] = useDataTableRowHeightPreference({
    tableId: archivedTableId,
  });
  const [archivedWrapHeaders, setArchivedWrapHeaders] = useDataTableWrapHeadersPreference({
    tableId: archivedTableId,
  });

  const currentTableConfig =
    tab === "active"
      ? {
          tableHook: activeTableHook,
          rowHeight: activeRowHeight,
          setRowHeight: setActiveRowHeight,
          wrapHeaders: activeWrapHeaders,
          setWrapHeaders: setActiveWrapHeaders,
        }
      : {
          tableHook: archivedTableHook,
          rowHeight: archivedRowHeight,
          setRowHeight: setArchivedRowHeight,
          wrapHeaders: archivedWrapHeaders,
          setWrapHeaders: setArchivedWrapHeaders,
        };

  const pageToolbar = (
    <UserCenterProjectsToolbar
      t={projectT}
      table={currentTableConfig.tableHook.table}
      searchInput={currentTableConfig.tableHook.searchInput}
      onSearchInputChange={currentTableConfig.tableHook.setSearchInput}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      rowHeight={currentTableConfig.rowHeight}
      onRowHeightChange={currentTableConfig.setRowHeight}
      wrapHeaders={currentTableConfig.wrapHeaders}
      onWrapHeadersChange={currentTableConfig.setWrapHeaders}
      onRefresh={() => void currentTableConfig.tableHook.refetch()}
      refreshing={currentTableConfig.tableHook.isFetching}
      onResetColumnVisibility={currentTableConfig.tableHook.resetColumnVisibility}
      labels={toolsLabels}
    />
  );

  const showPageAction = viewMode === "table";
  const renderCreateProjectButton = () => (
    <Button variant="default" onClick={handleOpenCreate}>
      <Plus size={16} />
      {t("account:ACCOUNT_PROJECTS_CREATE_ACTION")}
    </Button>
  );
  const activeCreateCard = (
    <ProjectsCreateCard
      title={t("account:ACCOUNT_PROJECTS_CREATE_ACTION")}
      description={t("account:ACCOUNT_PROJECTS_CREATE_DESC")}
      onClick={handleOpenCreate}
    />
  );

  return (
    <ChromeTabs
      value={tab}
      onValueChange={(value) => setTab(value === "archived" ? "archived" : "active")}
    >
      <DefaultPage
        title={t("account:ACCOUNT_PAGE_PROJECTS_TITLE")}
        contentClassName="min-h-0 flex flex-col"
        showFavoriteToggle={false}
        action={showPageAction ? renderCreateProjectButton() : undefined}
        extra={pageToolbar}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <ChromeTabsContent value="active" className="min-h-0 flex-1">
            <ProjectsContentSection
              viewMode={viewMode}
              tableHook={activeTableHook}
              emptyTitle={t("account:ACCOUNT_PROJECTS_EMPTY_TITLE")}
              emptyDescription={t("account:ACCOUNT_PROJECTS_EMPTY_DESC")}
              emptyExtra={renderCreateProjectButton()}
              onRetry={() => void activeTableHook.refetch()}
              onRowClick={(row) => handleEnterProject(row.original)}
              t={projectT}
              rowHeight={activeRowHeight}
              wrapHeaders={activeWrapHeaders}
              workspaceId={currentWorkspaceId ?? undefined}
              archived={false}
              searchInput={activeTableHook.searchInput}
              buildMenuItems={projectMenuActions.buildMenuItems}
              onPrepareProjectMenu={handlePrepareProjectMenu}
              editingProjectId={projectMenuActions.editingProjectId}
              editingProjectField={projectMenuActions.editingProjectField}
              editingProjectName={projectMenuActions.editingProjectName}
              editingProjectDescription={projectMenuActions.editingProjectDescription}
              onEditingProjectNameChange={projectMenuActions.setEditingProjectName}
              onEditingProjectDescriptionChange={projectMenuActions.setEditingProjectDescription}
              onCommitProjectEdit={projectMenuActions.commitProjectEdit}
              onCancelProjectEdit={projectMenuActions.cancelProjectEdit}
              disableProjectNavigation={projectMenuActions.isProjectEditNavigationSuppressed}
              onCardClick={(project) => handleEnterProject(project)}
              appendCard={activeCreateCard}
            />
          </ChromeTabsContent>

          <ChromeTabsContent value="archived" className="min-h-0 flex-1">
            <ProjectsContentSection
              viewMode={viewMode}
              tableHook={archivedTableHook}
              emptyTitle={t("account:ACCOUNT_PROJECTS_ARCHIVED_EMPTY_TITLE")}
              emptyDescription={t("account:ACCOUNT_PROJECTS_ARCHIVED_EMPTY_DESC")}
              onRetry={() => void archivedTableHook.refetch()}
              t={projectT}
              rowHeight={archivedRowHeight}
              wrapHeaders={archivedWrapHeaders}
              workspaceId={currentWorkspaceId ?? undefined}
              archived
              searchInput={archivedTableHook.searchInput}
              buildMenuItems={projectMenuActions.buildMenuItems}
              onPrepareProjectMenu={handlePrepareProjectMenu}
              editingProjectId={projectMenuActions.editingProjectId}
              editingProjectField={projectMenuActions.editingProjectField}
              editingProjectName={projectMenuActions.editingProjectName}
              editingProjectDescription={projectMenuActions.editingProjectDescription}
              onEditingProjectNameChange={projectMenuActions.setEditingProjectName}
              onEditingProjectDescriptionChange={projectMenuActions.setEditingProjectDescription}
              onCommitProjectEdit={projectMenuActions.commitProjectEdit}
              onCancelProjectEdit={projectMenuActions.cancelProjectEdit}
              disableProjectNavigation={projectMenuActions.isProjectEditNavigationSuppressed}
            />
          </ChromeTabsContent>
        </div>
      </DefaultPage>

      {projectMenuActions.iconDialog ? (
        <ProjectIconDialog t={projectT} dialog={projectMenuActions.iconDialog} />
      ) : null}
      <ProjectActionDialogs
        t={projectT}
        archiveDialog={projectMenuActions.archiveDialog}
        deleteDialog={projectMenuActions.deleteDialog}
      />
    </ChromeTabs>
  );
}
