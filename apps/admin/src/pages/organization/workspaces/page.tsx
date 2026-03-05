import { useCallback, useEffect, useState } from "react";

import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Button as AntButton, Form } from "antd";
import { Archive, LogIn, Plus, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { type OrganizationWorkspace } from "@/types/api";
import { DefaultPage } from "@/components/common/default-page";
import { ChromeTabsContent } from "@celestial/ui/chrome-tabs";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import {
  OrganizationWorkspacesDialogs,
  type CreateWorkspaceFormValues,
} from "./components/organization-workspaces-dialogs";
import { OrganizationWorkspacesToolbar } from "./components/organization-workspaces-toolbar";
import type {
  OrganizationWorkspacesTab,
  OrganizationWorkspacesViewMode,
  WorkspaceMenuItem,
} from "./types";
import { useOrganizationWorkspacesColumns } from "./components/workspaces-columns";
import { useOrganizationWorkspacesMutations } from "./hooks/use-organization-workspaces-mutations";
import { useOrganizationWorkspacesTables } from "./hooks/use-organization-workspaces-tables";
import { WorkspacesContentSection } from "./components/workspaces-table-section";

export function OrganizationWorkspacesPage() {
  const { orgId: organizationId } = useParams({ from: "/o/$orgId/workspaces/" });
  const { create } = useSearch({ from: "/o/$orgId/workspaces/" });
  const autoOpenCreate = create === "1";

  const { t } = useTranslation(["nav", "common"]);
  const navigate = useNavigate();
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);

  const [tab, setTab] = useState<OrganizationWorkspacesTab>("active");
  const [viewMode, setViewMode] = useState<OrganizationWorkspacesViewMode>("card");
  const [createOpen, setCreateOpen] = useState(autoOpenCreate);
  const [confirmArchive, setConfirmArchive] = useState<OrganizationWorkspace | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrganizationWorkspace | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const [createForm] = Form.useForm<CreateWorkspaceFormValues>();

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
    organizationId,
    t,
    onCreateSuccess: () => {
      setCreateOpen(false);
      createForm.resetFields();
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

  const { activeTableHook, archivedTableHook } = useOrganizationWorkspacesTables({
    organizationId,
    columns,
  });
  const currentTableHook = tab === "active" ? activeTableHook : archivedTableHook;
  const deleteConfirmMatches = deleteConfirmName.trim() === (confirmDelete?.name || "");

  return (
    <DefaultPage
      title={t("nav:NAV_ORG_WORKSPACES")}
      description={t("common:ORG_WORKSPACES_DESC")}
      contentClassName="min-h-0"
      action={
        <AntButton
          type="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            setCreateOpen(true);
          }}
          autoInsertSpace={false}
        >
          {t("common:ORG_WORKSPACES_CREATE")}
        </AntButton>
      }
    >
      <OrganizationWorkspacesToolbar
        t={t}
        tab={tab}
        onTabChange={setTab}
        searchInput={currentTableHook.searchInput}
        onSearchInputChange={currentTableHook.setSearchInput}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      >
        <ChromeTabsContent value="active">
          <WorkspacesContentSection
            viewMode={viewMode}
            tableHook={activeTableHook}
            emptyTitle={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_DESC")}
            onRetry={() => void activeTableHook.refetch()}
            onRowClick={(row) => handleEnterWorkspace(row.original.workspaceId)}
            t={t}
            organizationId={organizationId}
            archived={false}
            searchInput={activeTableHook.searchInput}
            buildMenuItems={buildCardMenuItems}
            onCardClick={(ws) => handleEnterWorkspace(ws.workspaceId)}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="archived">
          <WorkspacesContentSection
            viewMode={viewMode}
            tableHook={archivedTableHook}
            emptyTitle={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_DESC")}
            onRetry={() => void archivedTableHook.refetch()}
            t={t}
            organizationId={organizationId}
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
          form: createForm,
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
