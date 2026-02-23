import { useCallback, useEffect, useState } from "react";

import { useNavigate } from "@tanstack/react-router";
import { Button as AntButton, Form } from "antd";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { type OrganizationWorkspace } from "@/api/organization-workspaces";
import { DefaultPage } from "@/components/common/default-page";
import { ChromeTabsContent } from "@/components/ui/chrome-tabs";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import {
  OrganizationWorkspacesDialogs,
  type CreateWorkspaceFormValues,
} from "./organization-workspaces-dialogs";
import { OrganizationWorkspacesToolbar } from "./organization-workspaces-toolbar";
import type { OrganizationWorkspacesTab } from "./organization-workspaces-types";
import { useOrganizationWorkspacesColumns } from "./use-organization-workspaces-columns";
import { useOrganizationWorkspacesMutations } from "./use-organization-workspaces-mutations";
import { useOrganizationWorkspacesTables } from "./use-organization-workspaces-tables";
import { WorkspacesTableSection } from "./workspaces-table-section";

export function OrganizationWorkspacesPage(props?: {
  organizationId?: string;
  autoOpenCreate?: boolean;
}) {
  const { t } = useTranslation(["nav", "common"]);
  const navigate = useNavigate();
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);

  const [tab, setTab] = useState<OrganizationWorkspacesTab>("active");
  const [createOpen, setCreateOpen] = useState(Boolean(props?.autoOpenCreate));
  const [confirmArchive, setConfirmArchive] = useState<OrganizationWorkspace | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrganizationWorkspace | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const [createForm] = Form.useForm<CreateWorkspaceFormValues>();

  useEffect(() => {
    if (!props?.autoOpenCreate) return;
    setCreateOpen(true);
  }, [props?.autoOpenCreate]);

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
    organizationId: props?.organizationId,
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

  const columns = useOrganizationWorkspacesColumns({
    t,
    onArchiveWorkspace: setConfirmArchive,
    onRequestDeleteWorkspace: handleRequestDeleteWorkspace,
    onUnarchiveWorkspace: handleUnarchiveWorkspace,
    onEnterWorkspace: handleEnterWorkspace,
  });

  const { activeTableHook, archivedTableHook } = useOrganizationWorkspacesTables({
    organizationId: props?.organizationId,
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
      >
        <ChromeTabsContent value="active">
          <WorkspacesTableSection
            tableHook={activeTableHook}
            emptyTitle={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_DESC")}
            onRetry={() => void activeTableHook.refetch()}
            onRowClick={(row) => handleEnterWorkspace(row.original.workspaceId)}
            t={t}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="archived">
          <WorkspacesTableSection
            tableHook={archivedTableHook}
            emptyTitle={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_DESC")}
            onRetry={() => void archivedTableHook.refetch()}
            t={t}
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
