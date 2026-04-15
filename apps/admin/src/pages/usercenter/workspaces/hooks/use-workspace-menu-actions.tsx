import { useCallback, useState } from "react";
import { Archive, LogIn, Trash2, Undo2 } from "lucide-react";

import type { OrganizationWorkspace } from "@/types/api";

import type {
  UserCenterWorkspaceListItem,
  UserCenterWorkspacesTranslateFn,
  WorkspaceMenuItem,
} from "../types";
import { useUserCenterWorkspacesMutations } from "./use-usercenter-workspaces-mutations";

type UseWorkspaceMenuActionsOptions = {
  organizationId?: string;
  t: UserCenterWorkspacesTranslateFn;
  onEnterWorkspace: (workspaceId: string) => void;
  onArchiveSuccess?: () => void;
  onDeleteSuccess?: () => void;
};

export function useWorkspaceMenuActions({
  organizationId,
  t,
  onEnterWorkspace,
  onArchiveSuccess,
  onDeleteSuccess,
}: UseWorkspaceMenuActionsOptions) {
  const [confirmArchive, setConfirmArchive] = useState<OrganizationWorkspace | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrganizationWorkspace | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const mutations = useUserCenterWorkspacesMutations({
    organizationId,
    t,
    onCreateSuccess: () => undefined,
    onArchiveSuccess: () => {
      setConfirmArchive(null);
      onArchiveSuccess?.();
    },
    onDeleteSuccess: () => {
      setConfirmDelete(null);
      setDeleteConfirmName("");
      onDeleteSuccess?.();
    },
  });

  const requestDeleteWorkspace = useCallback((workspace: OrganizationWorkspace) => {
    setDeleteConfirmName("");
    setConfirmDelete(workspace);
  }, []);

  const unarchiveWorkspace = useCallback(
    (workspaceId: string) => {
      void mutations.unarchiveMutation.mutateAsync(workspaceId);
    },
    [mutations.unarchiveMutation],
  );

  const buildMenuItems = useCallback(
    (workspace: UserCenterWorkspaceListItem): WorkspaceMenuItem[] => {
      if (workspace.isArchived) {
        return [
          {
            key: "unarchive",
            icon: <Undo2 className="size-4" />,
            label: t("common:ORG_WORKSPACES_ACTION_UNARCHIVE"),
            onClick: () => unarchiveWorkspace(workspace.workspaceId),
          },
          { key: "divider", type: "divider", label: "" },
          {
            key: "delete",
            danger: true,
            icon: <Trash2 className="size-4" />,
            label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
            onClick: () => requestDeleteWorkspace(workspace as OrganizationWorkspace),
          },
        ];
      }

      return [
        {
          key: "enter",
          icon: <LogIn className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_ENTER"),
          onClick: () => onEnterWorkspace(workspace.workspaceId),
        },
        { key: "divider", type: "divider", label: "" },
        {
          key: "archive",
          icon: <Archive className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_ARCHIVE"),
          onClick: () => setConfirmArchive(workspace as OrganizationWorkspace),
        },
        {
          key: "delete",
          danger: true,
          icon: <Trash2 className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
          onClick: () => requestDeleteWorkspace(workspace as OrganizationWorkspace),
        },
      ];
    },
    [onEnterWorkspace, requestDeleteWorkspace, t, unarchiveWorkspace],
  );

  return {
    buildMenuItems,
    mutations,
    archiveDialog: {
      workspace: confirmArchive,
      setWorkspace: setConfirmArchive,
      pending: mutations.archiveMutation.isPending,
      onConfirm: async (workspaceId: string) => {
        await mutations.archiveMutation.mutateAsync(workspaceId);
      },
    },
    deleteDialog: {
      workspace: confirmDelete,
      setWorkspace: setConfirmDelete,
      confirmName: deleteConfirmName,
      setConfirmName: setDeleteConfirmName,
      confirmMatches: deleteConfirmName.trim() === (confirmDelete?.name || ""),
      pending: mutations.deleteMutation.isPending,
      onConfirm: async (payload: { workspaceId: string; confirmName: string }) => {
        await mutations.deleteMutation.mutateAsync(payload);
      },
    },
  } as const;
}
