import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, LogIn, Palette, Pencil, Settings2, Trash2, Undo2 } from "lucide-react";

import { getWorkspaceDangerCapabilities } from "@/api/workspaces";
import { notifyError, notifyErrorText } from "@/lib/notifications";
import type { WorkspaceDangerCapabilities } from "@/types/api";

import type {
  UserCenterWorkspaceListItem,
  UserCenterWorkspacesTranslateFn,
  WorkspaceMenuItem,
} from "../types";
import { useUserCenterWorkspacesMutations } from "./use-usercenter-workspaces-mutations";

export type WorkspaceIconDialogValues = {
  iconMode: "initials" | "glyph" | "emoji" | "image";
  iconColor: string;
  iconGlyph: string | null;
  iconEmoji: string | null;
  iconUrl: string | null;
};

export type WorkspaceEditingField = "name" | "description";

type WorkspaceDangerCapabilityState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: WorkspaceDangerCapabilities };

type UseWorkspaceMenuActionsOptions = {
  organizationId?: string;
  t: UserCenterWorkspacesTranslateFn;
  onEnterWorkspace: (workspace: UserCenterWorkspaceListItem) => void;
  onManageWorkspace: (workspace: UserCenterWorkspaceListItem) => void;
  onArchiveSuccess?: () => void;
  onDeleteSuccess?: () => void;
};

type WorkspaceDangerTarget = Pick<UserCenterWorkspaceListItem, "workspaceId" | "name">;

const EDIT_NAVIGATION_SUPPRESSION_MS = 240;

function normalizeWorkspaceDescription(value?: string | null) {
  return (value ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

function getBlockedReasonText(code: string | null | undefined, t: UserCenterWorkspacesTranslateFn) {
  if (!code) return null;
  const key = `errors:${code}`;
  const translated = t(key);
  return translated === key ? code : translated;
}

function buildIconDialogValues(workspace: UserCenterWorkspaceListItem): WorkspaceIconDialogValues {
  return {
    iconMode: workspace.iconMode,
    iconColor: workspace.iconColor,
    iconGlyph: workspace.iconGlyph ?? null,
    iconEmoji: workspace.iconEmoji ?? null,
    iconUrl: workspace.iconUrl ?? null,
  };
}

function buildWorkspaceIconPatch(values: WorkspaceIconDialogValues) {
  return {
    iconMode: values.iconMode,
    iconColor: values.iconColor,
    iconGlyph: values.iconMode === "glyph" ? values.iconGlyph : null,
    iconEmoji: values.iconMode === "emoji" ? values.iconEmoji : null,
    iconUrl: values.iconMode === "image" ? values.iconUrl : null,
  } as const;
}

export function useWorkspaceMenuActions({
  organizationId,
  t,
  onEnterWorkspace,
  onManageWorkspace,
  onArchiveSuccess,
  onDeleteSuccess,
}: UseWorkspaceMenuActionsOptions) {
  const queryClient = useQueryClient();
  const [confirmArchive, setConfirmArchive] = useState<WorkspaceDangerTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WorkspaceDangerTarget | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceField, setEditingWorkspaceField] = useState<WorkspaceEditingField | null>(
    null,
  );
  const [editingWorkspaceName, setEditingWorkspaceName] = useState("");
  const [editingWorkspaceDescription, setEditingWorkspaceDescription] = useState("");
  const [iconDialogWorkspace, setIconDialogWorkspace] =
    useState<UserCenterWorkspaceListItem | null>(null);
  const [isWorkspaceEditNavigationSuppressed, setIsWorkspaceEditNavigationSuppressed] =
    useState(false);
  const [workspaceDangerCapabilities, setWorkspaceDangerCapabilities] = useState<
    Record<string, WorkspaceDangerCapabilityState | undefined>
  >({});
  const [iconDialogValues, setIconDialogValues] = useState<WorkspaceIconDialogValues>({
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
  });
  const editNavigationTimerRef = useRef<number | null>(null);

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

  const fetchWorkspaceDangerCapabilities = useCallback(
    async (workspaceId: string) =>
      queryClient.fetchQuery({
        queryKey: ["workspace", "danger-capabilities", workspaceId],
        queryFn: async () => getWorkspaceDangerCapabilities(workspaceId),
      }),
    [queryClient],
  );

  const prefetchWorkspaceDangerCapabilities = useCallback(
    async (workspaceId: string) => {
      const cached = queryClient.getQueryData<WorkspaceDangerCapabilities>([
        "workspace",
        "danger-capabilities",
        workspaceId,
      ]);
      if (cached) {
        setWorkspaceDangerCapabilities((prev) => ({
          ...prev,
          [workspaceId]: { status: "ready", data: cached },
        }));
        return cached;
      }

      if (workspaceDangerCapabilities[workspaceId]?.status === "loading") {
        return null;
      }

      setWorkspaceDangerCapabilities((prev) => ({
        ...prev,
        [workspaceId]: { status: "loading", data: null },
      }));

      try {
        const danger = await fetchWorkspaceDangerCapabilities(workspaceId);
        setWorkspaceDangerCapabilities((prev) => ({
          ...prev,
          [workspaceId]: { status: "ready", data: danger },
        }));
        return danger;
      } catch {
        setWorkspaceDangerCapabilities((prev) => {
          const next = { ...prev };
          delete next[workspaceId];
          return next;
        });
        return null;
      }
    },
    [fetchWorkspaceDangerCapabilities, queryClient, workspaceDangerCapabilities],
  );

  const guardWorkspaceDangerAction = useCallback(
    async (workspaceId: string, action: "archive" | "delete") => {
      try {
        const danger = await fetchWorkspaceDangerCapabilities(workspaceId);
        const guard = action === "archive" ? danger.leaveAction : danger.deleteAction;
        if (guard.enabled) {
          return true;
        }

        notifyErrorText(getBlockedReasonText(guard.blockedReason, t) ?? t("errors:REQUEST_FAILED"));
        return false;
      } catch (error) {
        notifyError(error);
        return false;
      }
    },
    [fetchWorkspaceDangerCapabilities, t],
  );

  const requestArchiveWorkspace = useCallback(
    async (workspace: WorkspaceDangerTarget) => {
      const allowed = await guardWorkspaceDangerAction(workspace.workspaceId, "archive");
      if (!allowed) return;
      setConfirmArchive(workspace);
    },
    [guardWorkspaceDangerAction],
  );

  const requestDeleteWorkspace = useCallback(
    async (workspace: WorkspaceDangerTarget) => {
      const allowed = await guardWorkspaceDangerAction(workspace.workspaceId, "delete");
      if (!allowed) return;
      setDeleteConfirmName("");
      setConfirmDelete(workspace);
    },
    [guardWorkspaceDangerAction],
  );

  const suppressWorkspaceEditNavigation = useCallback(() => {
    if (editNavigationTimerRef.current) {
      window.clearTimeout(editNavigationTimerRef.current);
    }

    setIsWorkspaceEditNavigationSuppressed(true);
    editNavigationTimerRef.current = window.setTimeout(() => {
      setIsWorkspaceEditNavigationSuppressed(false);
      editNavigationTimerRef.current = null;
    }, EDIT_NAVIGATION_SUPPRESSION_MS);
  }, []);

  useEffect(
    () => () => {
      if (editNavigationTimerRef.current) {
        window.clearTimeout(editNavigationTimerRef.current);
      }
    },
    [],
  );

  const unarchiveWorkspace = useCallback(
    (workspaceId: string) => {
      void mutations.unarchiveMutation.mutateAsync(workspaceId);
    },
    [mutations.unarchiveMutation],
  );

  const startEditingWorkspaceField = useCallback(
    (workspace: UserCenterWorkspaceListItem, field: WorkspaceEditingField) => {
      setEditingWorkspaceId(workspace.workspaceId);
      setEditingWorkspaceField(field);
      setEditingWorkspaceName(workspace.name);
      setEditingWorkspaceDescription(normalizeWorkspaceDescription(workspace.description));
      setIsWorkspaceEditNavigationSuppressed(false);
    },
    [],
  );

  const startRenameWorkspace = useCallback(
    (workspace: UserCenterWorkspaceListItem) => {
      startEditingWorkspaceField(workspace, "name");
    },
    [startEditingWorkspaceField],
  );

  const startEditWorkspaceDescription = useCallback(
    (workspace: UserCenterWorkspaceListItem) => {
      startEditingWorkspaceField(workspace, "description");
    },
    [startEditingWorkspaceField],
  );

  const cancelWorkspaceEdit = useCallback(() => {
    setEditingWorkspaceField(null);
    setEditingWorkspaceId(null);
    setEditingWorkspaceName("");
    setEditingWorkspaceDescription("");
  }, []);

  const commitWorkspaceEdit = useCallback(
    async (workspace: UserCenterWorkspaceListItem, field: WorkspaceEditingField) => {
      if (editingWorkspaceId !== workspace.workspaceId) return;
      if (editingWorkspaceField !== field) return;

      suppressWorkspaceEditNavigation();

      if (field === "name") {
        const nextName = editingWorkspaceName.trim();
        if (!nextName || nextName === workspace.name) {
          cancelWorkspaceEdit();
          return;
        }

        await mutations.updateMutation.mutateAsync({
          workspaceId: workspace.workspaceId,
          patch: { name: nextName },
        });
        cancelWorkspaceEdit();
        return;
      }

      const nextDescription = normalizeWorkspaceDescription(editingWorkspaceDescription) || null;
      if ((normalizeWorkspaceDescription(workspace.description) || null) === nextDescription) {
        cancelWorkspaceEdit();
        return;
      }

      await mutations.updateMutation.mutateAsync({
        workspaceId: workspace.workspaceId,
        patch: { description: nextDescription },
      });
      cancelWorkspaceEdit();
    },
    [
      cancelWorkspaceEdit,
      editingWorkspaceDescription,
      editingWorkspaceField,
      editingWorkspaceId,
      editingWorkspaceName,
      mutations.updateMutation,
      suppressWorkspaceEditNavigation,
    ],
  );

  const openIconDialog = useCallback((workspace: UserCenterWorkspaceListItem) => {
    setIconDialogWorkspace(workspace);
    setIconDialogValues(buildIconDialogValues(workspace));
  }, []);

  const closeIconDialog = useCallback(() => {
    setIconDialogWorkspace(null);
  }, []);

  const saveIconDialog = useCallback(async () => {
    if (!iconDialogWorkspace) return;

    await mutations.updateMutation.mutateAsync({
      workspaceId: iconDialogWorkspace.workspaceId,
      patch: buildWorkspaceIconPatch(iconDialogValues),
    });
    closeIconDialog();
  }, [closeIconDialog, iconDialogValues, iconDialogWorkspace, mutations.updateMutation]);

  const buildMenuItems = useCallback(
    (workspace: UserCenterWorkspaceListItem): WorkspaceMenuItem[] => {
      const dangerState = workspaceDangerCapabilities[workspace.workspaceId];
      const danger = dangerState?.data ?? null;
      const dangerLoading = dangerState?.status === "loading";
      const archiveDisabled = dangerLoading || Boolean(danger && !danger.leaveAction.enabled);
      const deleteDisabled = dangerLoading || Boolean(danger && !danger.deleteAction.enabled);

      if (workspace.isArchived) {
        return [
          {
            key: "unarchive",
            icon: <Undo2 className="size-4" />,
            label: t("common:ORG_WORKSPACES_ACTION_UNARCHIVE"),
            onClick: () => unarchiveWorkspace(workspace.workspaceId),
          },
          {
            key: "delete",
            danger: true,
            icon: <Trash2 className="size-4" />,
            label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
            disabled: deleteDisabled,
            onClick: () => {
              void requestDeleteWorkspace(workspace);
            },
          },
        ];
      }

      return [
        {
          key: "enter",
          icon: <LogIn className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_ENTER"),
          onClick: () => onEnterWorkspace(workspace),
        },
        {
          key: "manage",
          icon: <Settings2 className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_MANAGE"),
          onClick: () => onManageWorkspace(workspace),
        },
        {
          key: "edit-workspace",
          icon: <Pencil className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_EDIT_WORKSPACE"),
          children: [
            {
              key: "rename",
              icon: <Pencil className="size-4" />,
              label: t("common:ORG_WORKSPACES_ACTION_RENAME"),
              onClick: () => startRenameWorkspace(workspace),
            },
            {
              key: "edit-description",
              icon: <Pencil className="size-4" />,
              label: t("common:ORG_WORKSPACES_ACTION_EDIT_DESCRIPTION"),
              onClick: () => startEditWorkspaceDescription(workspace),
            },
            {
              key: "change-icon",
              icon: <Palette className="size-4" />,
              label: t("common:ORG_WORKSPACES_ACTION_CHANGE_ICON"),
              onClick: () => openIconDialog(workspace),
            },
          ],
        },
        {
          key: "archive-trash-divider",
          label: "",
          type: "divider",
        },
        {
          key: "archive-trash",
          icon: <Archive className="size-4" />,
          label: t("common:ORG_WORKSPACES_ACTION_ARCHIVE_TRASH"),
          children: [
            {
              key: "archive",
              icon: <Archive className="size-4" />,
              label: t("common:ORG_WORKSPACES_ACTION_ARCHIVE"),
              disabled: archiveDisabled,
              onClick: () => {
                void requestArchiveWorkspace(workspace);
              },
            },
            {
              key: "delete",
              danger: true,
              icon: <Trash2 className="size-4" />,
              label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
              disabled: deleteDisabled,
              onClick: () => {
                void requestDeleteWorkspace(workspace);
              },
            },
          ],
        },
      ];
    },
    [
      onEnterWorkspace,
      onManageWorkspace,
      openIconDialog,
      workspaceDangerCapabilities,
      requestArchiveWorkspace,
      requestDeleteWorkspace,
      startEditWorkspaceDescription,
      startRenameWorkspace,
      t,
      unarchiveWorkspace,
    ],
  );

  return {
    buildMenuItems,
    mutations,
    editingWorkspaceId,
    editingWorkspaceField,
    editingWorkspaceName,
    editingWorkspaceDescription,
    setEditingWorkspaceName,
    setEditingWorkspaceDescription,
    startEditingWorkspaceField,
    startRenameWorkspace,
    startEditWorkspaceDescription,
    cancelWorkspaceEdit,
    commitWorkspaceEdit,
    prefetchWorkspaceDangerCapabilities,
    iconDialog: {
      workspace: iconDialogWorkspace,
      setWorkspace: setIconDialogWorkspace,
      values: iconDialogValues,
      setValues: setIconDialogValues,
      pending: mutations.updateMutation.isPending,
      onConfirm: saveIconDialog,
      onClose: closeIconDialog,
    },
    isWorkspaceEditNavigationSuppressed,
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
