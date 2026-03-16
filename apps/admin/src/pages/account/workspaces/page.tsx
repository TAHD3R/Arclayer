import { useCallback, useEffect, useState } from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";
import { Archive, LogIn, Plus, Trash2, Undo2 } from "@arclayer/ui/icons/lucide-animated";
import { useTranslation } from "react-i18next";

import { type OrganizationWorkspace } from "@/types/api";
import { DefaultPage } from "@/components/common/default-page";
import { Button } from "@arclayer/ui/button";
import { ChromeTabsContent } from "@arclayer/ui/chrome-tabs";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import {
  OrganizationWorkspacesDialogs,
  type CreateWorkspaceFormValues,
} from "@/pages/organization/workspaces/components/organization-workspaces-dialogs";
import { OrganizationWorkspacesToolbar } from "@/pages/organization/workspaces/components/organization-workspaces-toolbar";
import type {
  OrganizationWorkspacesTab,
  OrganizationWorkspacesViewMode,
  WorkspaceMenuItem,
} from "@/pages/organization/workspaces/types";
import { useOrganizationWorkspacesColumns } from "@/pages/organization/workspaces/components/workspaces-columns";
import { useOrganizationWorkspacesMutations } from "@/pages/organization/workspaces/hooks/use-organization-workspaces-mutations";
import { useOrganizationWorkspacesTables } from "@/pages/organization/workspaces/hooks/use-organization-workspaces-tables";
import { WorkspacesContentSection } from "@/pages/organization/workspaces/components/workspaces-table-section";
import { WorkspacesViewModeToggle } from "@/pages/organization/workspaces/components/workspaces-view-mode-toggle";

export function AccountWorkspacesPage() {
  const { create } = useSearch({ from: "/account/workspaces/" });
  const autoOpenCreate = create === "1";

  const { t } = useTranslation(["account", "common"]);
  const navigate = useNavigate();
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);

  const [tab, setTab] = useState<OrganizationWorkspacesTab>("active");
  const [viewMode, setViewMode] = useState<OrganizationWorkspacesViewMode>("card");
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

  const mutations = useOrganizationWorkspacesMutations({
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

  const columns = useOrganizationWorkspacesColumns({
    t,
    onArchiveWorkspace: setConfirmArchive,
    onRequestDeleteWorkspace: handleRequestDeleteWorkspace,
    onUnarchiveWorkspace: handleUnarchiveWorkspace,
    onEnterWorkspace: handleEnterWorkspace,
  });

  const { activeTableId, archivedTableId, activeTableHook, archivedTableHook } =
    useOrganizationWorkspacesTables({
      organizationId: undefined,
      columns,
    });
  const currentTableHook = tab === "active" ? activeTableHook : archivedTableHook;
  const deleteConfirmMatches = deleteConfirmName.trim() === (confirmDelete?.name || "");

  return (
    <DefaultPage
      title={t("account:ACCOUNT_PAGE_WORKSPACES_TITLE")}
      description={t("account:ACCOUNT_PAGE_WORKSPACES_DESC")}
      contentClassName="min-h-0"
      showFavoriteToggle={false}
      action={
        <div className="flex items-center gap-2">
          <WorkspacesViewModeToggle t={t} value={viewMode} onChange={setViewMode} />
          <Button
            variant="default"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            <Plus size={16} />
            {t("common:ORG_WORKSPACES_CREATE")}
          </Button>
        </div>
      }
    >
      <OrganizationWorkspacesToolbar
        t={t}
        tab={tab}
        onTabChange={setTab}
        searchInput={currentTableHook.searchInput}
        onSearchInputChange={currentTableHook.setSearchInput}
        showSearchInput={viewMode === "card"}
      >
        <ChromeTabsContent value="active">
          <WorkspacesContentSection
            tableId={activeTableId}
            viewMode={viewMode}
            tableHook={activeTableHook}
            emptyTitle={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_DESC")}
            onRetry={() => void activeTableHook.refetch()}
            onRowClick={(row) => handleEnterWorkspace(row.original.workspaceId)}
            t={t}
            organizationId={undefined}
            archived={false}
            searchInput={activeTableHook.searchInput}
            buildMenuItems={buildCardMenuItems}
            onCardClick={(workspace) => handleEnterWorkspace(workspace.workspaceId)}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="archived">
          <WorkspacesContentSection
            tableId={archivedTableId}
            viewMode={viewMode}
            tableHook={archivedTableHook}
            emptyTitle={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_DESC")}
            onRetry={() => void archivedTableHook.refetch()}
            t={t}
            organizationId={undefined}
            archived={true}
            searchInput={archivedTableHook.searchInput}
            buildMenuItems={buildCardMenuItems}
          />
        </ChromeTabsContent>
      </OrganizationWorkspacesToolbar>

      <OrganizationWorkspacesDialogs
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
    </DefaultPage>
  );
}
