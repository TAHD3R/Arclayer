import { useCallback, useEffect, useState } from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { workspaceHomePath } from "@/lib/routing/workspace-routing";
import { createNameSeedWorkspaceSlugState } from "@/lib/workspace-slug";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { Button } from "@arclayer/ui/button";
import { ChromeTabs, ChromeTabsContent } from "@arclayer/ui/chrome-tabs";
import {
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import {
  UserCenterWorkspacesDialogs,
  type CreateWorkspaceFormValues,
} from "@/pages/usercenter/workspaces/components/usercenter-workspaces-dialogs";
import { WorkspacesCreateCard } from "@/pages/usercenter/workspaces/components/workspaces-create-card";
import { UserCenterWorkspacesToolbar } from "@/pages/usercenter/workspaces/components/usercenter-workspaces-toolbar";
import { WorkspacesContentSection } from "@/pages/usercenter/workspaces/components/workspaces-table-section";
import { useUserCenterWorkspacesColumns } from "@/pages/usercenter/workspaces/components/workspaces-columns";
import { useWorkspaceMenuActions } from "@/pages/usercenter/workspaces/hooks/use-workspace-menu-actions";
import { useUserCenterWorkspacesTables } from "@/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-tables";
import type {
  UserCenterWorkspacesTab,
  UserCenterWorkspacesViewMode,
} from "@/pages/usercenter/workspaces/types";

export function WorkspacesPage() {
  const { create } = useSearch({ from: "/workspaces/" });
  const autoOpenCreate = create === "1";

  const { t } = useTranslation(["account", "common"]);
  const navigate = useNavigate();
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);

  const [tab, setTab] = useState<UserCenterWorkspacesTab>("active");
  const [viewMode, setViewMode] = useState<UserCenterWorkspacesViewMode>("card");
  const [createOpen, setCreateOpen] = useState(autoOpenCreate);
  const [createValues, setCreateValues] = useState<CreateWorkspaceFormValues>(() => {
    const initialSlugState = createNameSeedWorkspaceSlugState("");
    return {
      name: "",
      slug: initialSlugState.value,
      slugSource: initialSlugState.source,
      description: "",
    };
  });

  useEffect(() => {
    if (!autoOpenCreate) return;
    setCreateOpen(true);
  }, [autoOpenCreate]);

  const handleEnterWorkspace = useCallback(
    (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId);
      void navigate({ to: workspaceHomePath(workspaceId) as never });
    },
    [navigate, setCurrentWorkspaceId],
  );

  const handleManageWorkspace = useCallback(
    (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId);
      void navigate({ to: `/w/${workspaceId}/settings/workspace/` as never });
    },
    [navigate, setCurrentWorkspaceId],
  );
  const handleOpenCreate = useCallback(() => {
    setCreateOpen(true);
  }, []);

  const workspaceMenuActions = useWorkspaceMenuActions({
    organizationId: undefined,
    t,
    onEnterWorkspace: handleEnterWorkspace,
    onManageWorkspace: handleManageWorkspace,
  });

  const columns = useUserCenterWorkspacesColumns({
    t,
    buildMenuItems: workspaceMenuActions.buildMenuItems,
    onPrepareWorkspaceMenu: (workspaceId) => {
      void workspaceMenuActions.prefetchWorkspaceDangerCapabilities(workspaceId);
    },
    editingWorkspaceId: workspaceMenuActions.editingWorkspaceId,
    editingWorkspaceField: workspaceMenuActions.editingWorkspaceField,
    editingWorkspaceName: workspaceMenuActions.editingWorkspaceName,
    editingWorkspaceDescription: workspaceMenuActions.editingWorkspaceDescription,
    onEditingWorkspaceNameChange: workspaceMenuActions.setEditingWorkspaceName,
    onEditingWorkspaceDescriptionChange: workspaceMenuActions.setEditingWorkspaceDescription,
    onCommitWorkspaceEdit: workspaceMenuActions.commitWorkspaceEdit,
    onCancelWorkspaceEdit: workspaceMenuActions.cancelWorkspaceEdit,
  });

  const { activeTableId, archivedTableId, activeTableHook, archivedTableHook } =
    useUserCenterWorkspacesTables({
      organizationId: undefined,
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
    <UserCenterWorkspacesToolbar
      t={t}
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
  const renderCreateWorkspaceButton = () => (
    <Button variant="default" onClick={handleOpenCreate}>
      <Plus size={16} />
      {t("common:ORG_WORKSPACES_CREATE_TEAM")}
    </Button>
  );
  const activeCreateCard = (
    <WorkspacesCreateCard
      title={t("common:ORG_WORKSPACES_CREATE_TEAM")}
      description={t("common:ORG_WORKSPACES_CREATE_TEAM_DIALOG_DESC")}
      onClick={handleOpenCreate}
    />
  );

  return (
    <ChromeTabs
      value={tab}
      onValueChange={(value) => setTab(value === "archived" ? "archived" : "active")}
    >
      <DefaultPage
        title={t("account:ACCOUNT_PAGE_WORKSPACES_TITLE")}
        description={t("account:ACCOUNT_PAGE_WORKSPACES_DESC")}
        contentClassName="min-h-0 flex flex-col"
        showFavoriteToggle={false}
        action={showPageAction ? renderCreateWorkspaceButton() : undefined}
        extra={pageToolbar}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <ChromeTabsContent value="active" className="min-h-0 flex-1">
            <WorkspacesContentSection
              viewMode={viewMode}
              tableHook={activeTableHook}
              emptyTitle={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_TITLE")}
              emptyDescription={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_DESC")}
              emptyExtra={renderCreateWorkspaceButton()}
              onRetry={() => void activeTableHook.refetch()}
              onRowClick={(row) => handleEnterWorkspace(row.original.workspaceId)}
              t={t}
              rowHeight={activeRowHeight}
              wrapHeaders={activeWrapHeaders}
              organizationId={undefined}
              archived={false}
              searchInput={activeTableHook.searchInput}
              buildMenuItems={workspaceMenuActions.buildMenuItems}
              onPrepareWorkspaceMenu={(workspaceId) => {
                void workspaceMenuActions.prefetchWorkspaceDangerCapabilities(workspaceId);
              }}
              editingWorkspaceId={workspaceMenuActions.editingWorkspaceId}
              editingWorkspaceField={workspaceMenuActions.editingWorkspaceField}
              editingWorkspaceName={workspaceMenuActions.editingWorkspaceName}
              editingWorkspaceDescription={workspaceMenuActions.editingWorkspaceDescription}
              onEditingWorkspaceNameChange={workspaceMenuActions.setEditingWorkspaceName}
              onEditingWorkspaceDescriptionChange={
                workspaceMenuActions.setEditingWorkspaceDescription
              }
              onCommitWorkspaceEdit={workspaceMenuActions.commitWorkspaceEdit}
              onCancelWorkspaceEdit={workspaceMenuActions.cancelWorkspaceEdit}
              disableWorkspaceNavigation={workspaceMenuActions.isWorkspaceEditNavigationSuppressed}
              onCardClick={(workspace) => handleEnterWorkspace(workspace.workspaceId)}
              appendCard={activeCreateCard}
            />
          </ChromeTabsContent>

          <ChromeTabsContent value="archived" className="min-h-0 flex-1">
            <WorkspacesContentSection
              viewMode={viewMode}
              tableHook={archivedTableHook}
              emptyTitle={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_TITLE")}
              emptyDescription={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_DESC")}
              onRetry={() => void archivedTableHook.refetch()}
              t={t}
              rowHeight={archivedRowHeight}
              wrapHeaders={archivedWrapHeaders}
              organizationId={undefined}
              archived
              searchInput={archivedTableHook.searchInput}
              buildMenuItems={workspaceMenuActions.buildMenuItems}
              onPrepareWorkspaceMenu={(workspaceId) => {
                void workspaceMenuActions.prefetchWorkspaceDangerCapabilities(workspaceId);
              }}
              editingWorkspaceId={workspaceMenuActions.editingWorkspaceId}
              editingWorkspaceField={workspaceMenuActions.editingWorkspaceField}
              editingWorkspaceName={workspaceMenuActions.editingWorkspaceName}
              editingWorkspaceDescription={workspaceMenuActions.editingWorkspaceDescription}
              onEditingWorkspaceNameChange={workspaceMenuActions.setEditingWorkspaceName}
              onEditingWorkspaceDescriptionChange={
                workspaceMenuActions.setEditingWorkspaceDescription
              }
              onCommitWorkspaceEdit={workspaceMenuActions.commitWorkspaceEdit}
              onCancelWorkspaceEdit={workspaceMenuActions.cancelWorkspaceEdit}
              disableWorkspaceNavigation={workspaceMenuActions.isWorkspaceEditNavigationSuppressed}
            />
          </ChromeTabsContent>
        </div>
      </DefaultPage>

      <UserCenterWorkspacesDialogs
        t={t}
        createDialog={{
          open: createOpen,
          organizationId: undefined,
          setOpen: setCreateOpen,
          values: createValues,
          setValues: setCreateValues,
          pending: workspaceMenuActions.mutations.createMutation.isPending,
          onSubmit: async (values) => {
            await workspaceMenuActions.mutations.createMutation.mutateAsync(values);
            setCreateOpen(false);
            const resetSlugState = createNameSeedWorkspaceSlugState("");
            setCreateValues({
              name: "",
              slug: resetSlugState.value,
              slugSource: resetSlugState.source,
              description: "",
            });
          },
        }}
        archiveDialog={workspaceMenuActions.archiveDialog}
        deleteDialog={workspaceMenuActions.deleteDialog}
        iconDialog={workspaceMenuActions.iconDialog}
      />
    </ChromeTabs>
  );
}
