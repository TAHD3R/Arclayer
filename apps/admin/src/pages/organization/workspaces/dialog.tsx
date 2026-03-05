import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button as AntButton, Form } from "antd";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { OrganizationWorkspace } from "@/types/api";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { ComplexDialog } from "@celestial/ui/complex-dialog";
import { ChromeTabsContent } from "@celestial/ui/chrome-tabs";

import {
  OrganizationWorkspacesDialogs,
  type CreateWorkspaceFormValues,
} from "./components/organization-workspaces-dialogs";
import { OrganizationWorkspacesToolbar } from "./components/organization-workspaces-toolbar";
import { WorkspacesContentSection } from "./components/workspaces-table-section";
import { useOrganizationWorkspacesColumns } from "./components/workspaces-columns";
import { useOrganizationWorkspacesMutations } from "./hooks/use-organization-workspaces-mutations";
import {
  type OrganizationWorkspaceTableHook,
  useOrganizationWorkspacesTables,
} from "./hooks/use-organization-workspaces-tables";
import type {
  OrganizationWorkspacesTab,
  OrganizationWorkspacesViewMode,
  OrganizationWorkspacesTranslateFn,
  WorkspaceMenuItem,
} from "./types";

export type OrganizationWorkspacesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  initialTab?: OrganizationWorkspacesTab;
  autoOpenCreate?: boolean;
  onEnterWorkspace: (workspaceId: string) => void;
};

type Controller = {
  t: OrganizationWorkspacesTranslateFn;
  tab: OrganizationWorkspacesTab;
  setTab: Dispatch<SetStateAction<OrganizationWorkspacesTab>>;
  viewMode: OrganizationWorkspacesViewMode;
  setViewMode: Dispatch<SetStateAction<OrganizationWorkspacesViewMode>>;
  createOpen: boolean;
  setCreateOpen: Dispatch<SetStateAction<boolean>>;
  createForm: ReturnType<typeof Form.useForm<CreateWorkspaceFormValues>>[0];
  confirmArchive: OrganizationWorkspace | null;
  setConfirmArchive: Dispatch<SetStateAction<OrganizationWorkspace | null>>;
  confirmDelete: OrganizationWorkspace | null;
  setConfirmDelete: Dispatch<SetStateAction<OrganizationWorkspace | null>>;
  deleteConfirmName: string;
  setDeleteConfirmName: Dispatch<SetStateAction<string>>;
  deleteConfirmMatches: boolean;
  buildCardMenuItems: (ws: OrganizationWorkspace) => WorkspaceMenuItem[];
  activeTableHook: OrganizationWorkspaceTableHook;
  archivedTableHook: OrganizationWorkspaceTableHook;
  currentTableHook: OrganizationWorkspaceTableHook;
  onEnterWorkspace: (workspaceId: string) => void;
  mutations: ReturnType<typeof useOrganizationWorkspacesMutations>;
};

function buildWorkspaceCardMenuItems(args: {
  t: OrganizationWorkspacesTranslateFn;
  workspace: OrganizationWorkspace;
  onEnter: (id: string) => void;
  onUnarchive: (id: string) => void;
  onArchive: (ws: OrganizationWorkspace) => void;
  onDelete: (ws: OrganizationWorkspace) => void;
}): WorkspaceMenuItem[] {
  const { t, workspace } = args;

  if (workspace.isArchived) {
    return [
      {
        key: "unarchive",
        label: t("common:ORG_WORKSPACES_ACTION_UNARCHIVE"),
        onClick: () => args.onUnarchive(workspace.workspaceId),
      },
      { key: "divider", type: "divider" as const, label: "" },
      {
        key: "delete",
        danger: true,
        label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
        onClick: () => args.onDelete(workspace),
      },
    ];
  }

  return [
    {
      key: "enter",
      label: t("common:ORG_WORKSPACES_ACTION_ENTER"),
      onClick: () => args.onEnter(workspace.workspaceId),
    },
    { key: "divider", type: "divider" as const, label: "" },
    {
      key: "archive",
      label: t("common:ORG_WORKSPACES_ACTION_ARCHIVE"),
      onClick: () => args.onArchive(workspace),
    },
    {
      key: "delete",
      danger: true,
      label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
      onClick: () => args.onDelete(workspace),
    },
  ];
}

function useOrganizationWorkspacesDialogController(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  initialTab: OrganizationWorkspacesTab;
  autoOpenCreate: boolean;
  onEnterWorkspace: (workspaceId: string) => void;
}): Controller {
  const { t } = useTranslation(["nav", "common"]);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const [tab, setTab] = useState<OrganizationWorkspacesTab>(args.initialTab);
  const [viewMode, setViewMode] = useState<OrganizationWorkspacesViewMode>("card");
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<OrganizationWorkspace | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrganizationWorkspace | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [createForm] = Form.useForm<CreateWorkspaceFormValues>();

  useEffect(() => {
    if (args.open && args.autoOpenCreate) setCreateOpen(true);
  }, [args.autoOpenCreate, args.open]);

  const onEnterWorkspace = useCallback(
    (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId);
      args.onOpenChange(false);
      args.onEnterWorkspace(workspaceId);
    },
    [args, setCurrentWorkspaceId],
  );

  const onDelete = useCallback((ws: OrganizationWorkspace) => {
    setDeleteConfirmName("");
    setConfirmDelete(ws);
  }, []);

  const mutations = useOrganizationWorkspacesMutations({
    organizationId: args.organizationId,
    t,
    onCreateSuccess: () => {
      setCreateOpen(false);
      createForm.resetFields();
    },
    onArchiveSuccess: () => setConfirmArchive(null),
    onDeleteSuccess: () => {
      setConfirmDelete(null);
      setDeleteConfirmName("");
    },
  });

  const onUnarchive = useCallback(
    (workspaceId: string) => {
      void mutations.unarchiveMutation.mutateAsync(workspaceId);
    },
    [mutations.unarchiveMutation],
  );

  const buildCardMenuItems = useCallback(
    (workspace: OrganizationWorkspace) =>
      buildWorkspaceCardMenuItems({
        t,
        workspace,
        onEnter: onEnterWorkspace,
        onUnarchive,
        onArchive: setConfirmArchive,
        onDelete,
      }),
    [onDelete, onEnterWorkspace, onUnarchive, t],
  );

  const columns = useOrganizationWorkspacesColumns({
    t,
    onArchiveWorkspace: setConfirmArchive,
    onRequestDeleteWorkspace: onDelete,
    onUnarchiveWorkspace: onUnarchive,
    onEnterWorkspace,
  });
  const { activeTableHook, archivedTableHook } = useOrganizationWorkspacesTables({
    organizationId: args.organizationId,
    columns,
  });
  const currentTableHook = tab === "active" ? activeTableHook : archivedTableHook;
  const deleteConfirmMatches = useMemo(
    () => deleteConfirmName.trim() === (confirmDelete?.name || ""),
    [confirmDelete?.name, deleteConfirmName],
  );

  return {
    t,
    tab,
    setTab,
    viewMode,
    setViewMode,
    createOpen,
    setCreateOpen,
    createForm,
    confirmArchive,
    setConfirmArchive,
    confirmDelete,
    setConfirmDelete,
    deleteConfirmName,
    setDeleteConfirmName,
    deleteConfirmMatches,
    buildCardMenuItems,
    activeTableHook,
    archivedTableHook,
    currentTableHook,
    onEnterWorkspace,
    mutations,
  };
}

function DialogHeaderCreateButton(props: {
  t: OrganizationWorkspacesTranslateFn;
  onClick: () => void;
}) {
  return (
    <AntButton
      type="primary"
      icon={<Plus size={16} />}
      onClick={props.onClick}
      autoInsertSpace={false}
    >
      {props.t("common:ORG_WORKSPACES_CREATE")}
    </AntButton>
  );
}

function ActiveTab(props: {
  t: OrganizationWorkspacesTranslateFn;
  organizationId: string;
  viewMode: OrganizationWorkspacesViewMode;
  tableHook: OrganizationWorkspaceTableHook;
  buildMenuItems: (ws: OrganizationWorkspace) => WorkspaceMenuItem[];
  onEnter: (workspaceId: string) => void;
}) {
  return (
    <ChromeTabsContent value="active">
      <WorkspacesContentSection
        viewMode={props.viewMode}
        tableHook={props.tableHook}
        emptyTitle={props.t("common:ORG_WORKSPACES_ACTIVE_EMPTY_TITLE")}
        emptyDescription={props.t("common:ORG_WORKSPACES_ACTIVE_EMPTY_DESC")}
        onRetry={() => void props.tableHook.refetch()}
        onRowClick={(row) => props.onEnter(row.original.workspaceId)}
        t={props.t}
        organizationId={props.organizationId}
        archived={false}
        searchInput={props.tableHook.searchInput}
        buildMenuItems={props.buildMenuItems}
        onCardClick={(ws) => props.onEnter(ws.workspaceId)}
      />
    </ChromeTabsContent>
  );
}

function ArchivedTab(props: {
  t: OrganizationWorkspacesTranslateFn;
  organizationId: string;
  viewMode: OrganizationWorkspacesViewMode;
  tableHook: OrganizationWorkspaceTableHook;
  buildMenuItems: (ws: OrganizationWorkspace) => WorkspaceMenuItem[];
}) {
  return (
    <ChromeTabsContent value="archived">
      <WorkspacesContentSection
        viewMode={props.viewMode}
        tableHook={props.tableHook}
        emptyTitle={props.t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_TITLE")}
        emptyDescription={props.t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_DESC")}
        onRetry={() => void props.tableHook.refetch()}
        t={props.t}
        organizationId={props.organizationId}
        archived={true}
        searchInput={props.tableHook.searchInput}
        buildMenuItems={props.buildMenuItems}
      />
    </ChromeTabsContent>
  );
}

function OrganizationWorkspacesDialogBody(props: {
  organizationId: string;
  t: OrganizationWorkspacesTranslateFn;
  tab: OrganizationWorkspacesTab;
  onTabChange: (tab: OrganizationWorkspacesTab) => void;
  viewMode: OrganizationWorkspacesViewMode;
  onViewModeChange: (mode: OrganizationWorkspacesViewMode) => void;
  activeTableHook: OrganizationWorkspaceTableHook;
  archivedTableHook: OrganizationWorkspaceTableHook;
  currentTableHook: OrganizationWorkspaceTableHook;
  buildMenuItems: (ws: OrganizationWorkspace) => WorkspaceMenuItem[];
  onEnterWorkspace: (workspaceId: string) => void;
}) {
  return (
    <OrganizationWorkspacesToolbar
      t={props.t}
      tab={props.tab}
      onTabChange={props.onTabChange}
      searchInput={props.currentTableHook.searchInput}
      onSearchInputChange={props.currentTableHook.setSearchInput}
      viewMode={props.viewMode}
      onViewModeChange={props.onViewModeChange}
    >
      <ActiveTab
        t={props.t}
        organizationId={props.organizationId}
        viewMode={props.viewMode}
        tableHook={props.activeTableHook}
        buildMenuItems={props.buildMenuItems}
        onEnter={props.onEnterWorkspace}
      />
      <ArchivedTab
        t={props.t}
        organizationId={props.organizationId}
        viewMode={props.viewMode}
        tableHook={props.archivedTableHook}
        buildMenuItems={props.buildMenuItems}
      />
    </OrganizationWorkspacesToolbar>
  );
}

function OrganizationWorkspacesDialogModals(props: {
  t: OrganizationWorkspacesTranslateFn;
  createDialog: {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    form: ReturnType<typeof Form.useForm<CreateWorkspaceFormValues>>[0];
    pending: boolean;
    onSubmit: (values: CreateWorkspaceFormValues) => Promise<void>;
  };
  archiveDialog: {
    workspace: OrganizationWorkspace | null;
    setWorkspace: Dispatch<SetStateAction<OrganizationWorkspace | null>>;
    pending: boolean;
    onConfirm: (workspaceId: string) => Promise<void>;
  };
  deleteDialog: {
    workspace: OrganizationWorkspace | null;
    setWorkspace: Dispatch<SetStateAction<OrganizationWorkspace | null>>;
    confirmName: string;
    setConfirmName: Dispatch<SetStateAction<string>>;
    confirmMatches: boolean;
    pending: boolean;
    onConfirm: (payload: { workspaceId: string; confirmName: string }) => Promise<void>;
  };
}) {
  return (
    <OrganizationWorkspacesDialogs
      t={props.t}
      createDialog={props.createDialog}
      archiveDialog={props.archiveDialog}
      deleteDialog={props.deleteDialog}
    />
  );
}

export function OrganizationWorkspacesDialog({
  open,
  onOpenChange,
  organizationId,
  initialTab = "active",
  autoOpenCreate = false,
  onEnterWorkspace,
}: OrganizationWorkspacesDialogProps) {
  const c = useOrganizationWorkspacesDialogController({
    open,
    onOpenChange,
    organizationId,
    initialTab,
    autoOpenCreate,
    onEnterWorkspace,
  });

  return (
    <ComplexDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={c.t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
      description={c.t("common:ORG_WORKSPACES_DESC")}
      headerRight={<DialogHeaderCreateButton t={c.t} onClick={() => c.setCreateOpen(true)} />}
      bodyClassName="pt-3"
    >
      <OrganizationWorkspacesDialogBody
        organizationId={organizationId}
        t={c.t}
        tab={c.tab}
        onTabChange={c.setTab}
        viewMode={c.viewMode}
        onViewModeChange={c.setViewMode}
        activeTableHook={c.activeTableHook}
        archivedTableHook={c.archivedTableHook}
        currentTableHook={c.currentTableHook}
        buildMenuItems={c.buildCardMenuItems}
        onEnterWorkspace={c.onEnterWorkspace}
      />
      <OrganizationWorkspacesDialogModals
        t={c.t}
        createDialog={{
          open: c.createOpen,
          setOpen: c.setCreateOpen,
          form: c.createForm,
          pending: c.mutations.createMutation.isPending,
          onSubmit: async (values) => {
            await c.mutations.createMutation.mutateAsync(values);
          },
        }}
        archiveDialog={{
          workspace: c.confirmArchive,
          setWorkspace: c.setConfirmArchive,
          pending: c.mutations.archiveMutation.isPending,
          onConfirm: async (workspaceId) => {
            await c.mutations.archiveMutation.mutateAsync(workspaceId);
          },
        }}
        deleteDialog={{
          workspace: c.confirmDelete,
          setWorkspace: c.setConfirmDelete,
          confirmName: c.deleteConfirmName,
          setConfirmName: c.setDeleteConfirmName,
          confirmMatches: c.deleteConfirmMatches,
          pending: c.mutations.deleteMutation.isPending,
          onConfirm: async (payload) => {
            await c.mutations.deleteMutation.mutateAsync(payload);
          },
        }}
      />
    </ComplexDialog>
  );
}
