import { useCallback, useEffect, useState } from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";
import { Archive, LogIn, Plus, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { type OrganizationWorkspace } from "@/types/api";
import { DefaultPage } from "@/layouts/page-shell/default-page";
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
import { UserCenterWorkspacesToolbar } from "@/pages/usercenter/workspaces/components/usercenter-workspaces-toolbar";
import { WorkspacesContentSection } from "@/pages/usercenter/workspaces/components/workspaces-table-section";
import { useUserCenterWorkspacesColumns } from "@/pages/usercenter/workspaces/components/workspaces-columns";
import { useUserCenterWorkspacesMutations } from "@/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-mutations";
import { useUserCenterWorkspacesTables } from "@/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-tables";
import type {
  UserCenterWorkspacesTab,
  UserCenterWorkspacesViewMode,
  WorkspaceMenuItem,
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
  const [createValues, setCreateValues] = useState<CreateWorkspaceFormValues>({
    name: "",
    description: "",
  });
  const [confirmArchive, setConfirmArchive] = useState<OrganizationWorkspace | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrganizationWorkspace | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  useEffect(() => {
    if (!autoOpenCreate) return;
    setCreateOpen(true);
  }, [autoOpenCreate]);

  const handleEnterWorkspace = useCallback(
    (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId);
      void navigate({ to: `/w/${workspaceId}` });
    },
    [navigate, setCurrentWorkspaceId],
  );

  const handleRequestDeleteWorkspace = useCallback((workspace: OrganizationWorkspace) => {
    setDeleteConfirmName("");
    setConfirmDelete(workspace);
  }, []);

  const mutations = useUserCenterWorkspacesMutations({
    organizationId: undefined,
    t,
    onCreateSuccess: () => {
      setCreateOpen(false);
      setCreateValues({ name: "", description: "" });
    },
    onArchiveSuccess: () => {
      setConfirmArchive(null);
    },
    onDeleteSuccess: () => {
      setConfirmDelete(null);
      setDeleteConfirmName("");
    },
  });

  const handleUnarchiveWorkspace = useCallback(
    (workspaceId: string) => {
      void mutations.unarchiveMutation.mutateAsync(workspaceId);
    },
    [mutations.unarchiveMutation],
  );

  const buildCardMenuItems = useCallback(
    (workspace: OrganizationWorkspace): WorkspaceMenuItem[] => {
      if (workspace.isArchived) {
        return [
          {
            key: "unarchive",
            icon: <Undo2 className="size-4" />,
            label: t("common:ORG_WORKSPACES_ACTION_UNARCHIVE"),
            onClick: () => handleUnarchiveWorkspace(workspace.workspaceId),
          },
          { key: "divider", type: "divider" as const, label: "" },
          {
            key: "delete",
            danger: true,
            icon: <Trash2 className="size-4" />,
            label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
            onClick: () => handleRequestDeleteWorkspace(workspace),
          },
        ];
      }
      return [
        {
          key: "enter",
          icon: <LogIn className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_ENTER"),
          onClick: () => handleEnterWorkspace(workspace.workspaceId),
        },
        { key: "divider", type: "divider" as const, label: "" },
        {
          key: "archive",
          icon: <Archive className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_ARCHIVE"),
          onClick: () => setConfirmArchive(workspace),
        },
        {
          key: "delete",
          danger: true,
          icon: <Trash2 className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
          onClick: () => handleRequestDeleteWorkspace(workspace),
        },
      ];
    },
    [t, handleEnterWorkspace, handleUnarchiveWorkspace, handleRequestDeleteWorkspace],
  );

  const columns = useUserCenterWorkspacesColumns({
    t,
    onArchiveWorkspace: setConfirmArchive,
    onRequestDeleteWorkspace: handleRequestDeleteWorkspace,
    onUnarchiveWorkspace: handleUnarchiveWorkspace,
    onEnterWorkspace: handleEnterWorkspace,
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
  const deleteConfirmMatches = deleteConfirmName.trim() === (confirmDelete?.name || "");

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
        action={
          <Button
            variant="default"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            <Plus size={16} />
            {t("common:ORG_WORKSPACES_CREATE")}
          </Button>
        }
        extra={
          viewMode === "card" ? (
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
          ) : undefined
        }
      >
        <ChromeTabsContent value="active" className="min-h-0 flex-1">
          <WorkspacesContentSection
            viewMode={viewMode}
            tableHook={activeTableHook}
            emptyTitle={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_DESC")}
            onRetry={() => void activeTableHook.refetch()}
            onRowClick={(row) => handleEnterWorkspace(row.original.workspaceId)}
            t={t}
            rowHeight={activeRowHeight}
            wrapHeaders={activeWrapHeaders}
            organizationId={undefined}
            archived={false}
            searchInput={activeTableHook.searchInput}
            buildMenuItems={buildCardMenuItems}
            onCardClick={(workspace) => handleEnterWorkspace(workspace.workspaceId)}
            toolbar={
              tab === "active" && viewMode === "table" ? (
                <UserCenterWorkspacesToolbar
                  t={t}
                  table={activeTableHook.table}
                  searchInput={activeTableHook.searchInput}
                  onSearchInputChange={activeTableHook.setSearchInput}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  rowHeight={activeRowHeight}
                  onRowHeightChange={setActiveRowHeight}
                  wrapHeaders={activeWrapHeaders}
                  onWrapHeadersChange={setActiveWrapHeaders}
                  onRefresh={() => void activeTableHook.refetch()}
                  refreshing={activeTableHook.isFetching}
                  onResetColumnVisibility={activeTableHook.resetColumnVisibility}
                  labels={toolsLabels}
                />
              ) : undefined
            }
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
            buildMenuItems={buildCardMenuItems}
            toolbar={
              tab === "archived" && viewMode === "table" ? (
                <UserCenterWorkspacesToolbar
                  t={t}
                  table={archivedTableHook.table}
                  searchInput={archivedTableHook.searchInput}
                  onSearchInputChange={archivedTableHook.setSearchInput}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  rowHeight={archivedRowHeight}
                  onRowHeightChange={setArchivedRowHeight}
                  wrapHeaders={archivedWrapHeaders}
                  onWrapHeadersChange={setArchivedWrapHeaders}
                  onRefresh={() => void archivedTableHook.refetch()}
                  refreshing={archivedTableHook.isFetching}
                  onResetColumnVisibility={archivedTableHook.resetColumnVisibility}
                  labels={toolsLabels}
                />
              ) : undefined
            }
          />
        </ChromeTabsContent>
      </DefaultPage>

      <UserCenterWorkspacesDialogs
        t={t}
        createDialog={{
          open: createOpen,
          setOpen: setCreateOpen,
          values: createValues,
          setValues: setCreateValues,
          pending: mutations.createMutation.isPending,
          onSubmit: async (values) => {
            await mutations.createMutation.mutateAsync(values);
          },
        }}
        archiveDialog={{
          workspace: confirmArchive,
          setWorkspace: setConfirmArchive,
          pending: mutations.archiveMutation.isPending,
          onConfirm: async (workspaceId) => {
            await mutations.archiveMutation.mutateAsync(workspaceId);
          },
        }}
        deleteDialog={{
          workspace: confirmDelete,
          setWorkspace: setConfirmDelete,
          confirmName: deleteConfirmName,
          setConfirmName: setDeleteConfirmName,
          confirmMatches: deleteConfirmMatches,
          pending: mutations.deleteMutation.isPending,
          onConfirm: async (payload) => {
            await mutations.deleteMutation.mutateAsync(payload);
          },
        }}
      />
    </ChromeTabs>
  );
}
