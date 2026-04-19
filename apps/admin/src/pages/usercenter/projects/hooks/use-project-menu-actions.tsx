import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, LogIn, Palette, Pencil, Settings2, Trash2, Undo2 } from "lucide-react";

import { getProjectDangerCapabilities } from "@/api/projects";
import { notifyError, notifyErrorText } from "@/lib/notifications";
import type { ProjectDangerCapabilities } from "@/types/api";

import type {
  ProjectMenuItem,
  UserCenterProjectListItem,
  UserCenterProjectsTranslateFn,
} from "../types";
import { useUserCenterProjectsMutations } from "./use-usercenter-projects-mutations";

export type ProjectIconDialogValues = {
  iconMode: "initials" | "glyph" | "emoji" | "image";
  iconColor: string;
  iconGlyph: string | null;
  iconEmoji: string | null;
  iconUrl: string | null;
};

export type ProjectEditingField = "name" | "description";

type UseProjectMenuActionsOptions = {
  workspaceId?: string;
  t: UserCenterProjectsTranslateFn;
  onEnterProject: (project: UserCenterProjectListItem) => void;
  onManageProject: (project: UserCenterProjectListItem) => void;
  onArchiveSuccess?: () => void;
  onDeleteSuccess?: () => void;
};

type ProjectDangerTarget = Pick<UserCenterProjectListItem, "projectId" | "name">;

type ProjectDangerCapabilityState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: ProjectDangerCapabilities };

type ProjectDangerActionState = {
  archiveDisabled: boolean;
  deleteDisabled: boolean;
};

const projectDangerCapabilitiesKey = (projectId: string) =>
  ["project", "danger-capabilities", projectId] as const;

const EDIT_NAVIGATION_SUPPRESSION_MS = 240;

function normalizeProjectDescription(value?: string | null) {
  return (value ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

function getBlockedReasonText(code: string | null | undefined, t: UserCenterProjectsTranslateFn) {
  if (!code) return null;
  const key = `errors:${code}`;
  const translated = t(key);
  return translated === key ? code : translated;
}

function buildIconDialogValues(project: UserCenterProjectListItem): ProjectIconDialogValues {
  return {
    iconMode: project.iconMode,
    iconColor: project.iconColor,
    iconGlyph: project.iconGlyph ?? null,
    iconEmoji: project.iconEmoji ?? null,
    iconUrl: project.iconUrl ?? null,
  };
}

function buildProjectIconPatch(values: ProjectIconDialogValues) {
  return {
    iconMode: values.iconMode,
    iconColor: values.iconColor,
    iconGlyph: values.iconMode === "glyph" ? values.iconGlyph : null,
    iconEmoji: values.iconMode === "emoji" ? values.iconEmoji : null,
    iconUrl: values.iconMode === "image" ? values.iconUrl : null,
  } as const;
}

function resolveProjectDangerActionState(
  projectId: string,
  queryClient: ReturnType<typeof useQueryClient>,
  projectDangerCapabilities: Record<string, ProjectDangerCapabilityState | undefined>,
): ProjectDangerActionState {
  const queryState = queryClient.getQueryState(projectDangerCapabilitiesKey(projectId));
  const danger =
    queryClient.getQueryData<ProjectDangerCapabilities>(projectDangerCapabilitiesKey(projectId)) ??
    projectDangerCapabilities[projectId]?.data ??
    null;
  const dangerLoading =
    queryState?.fetchStatus === "fetching" ||
    projectDangerCapabilities[projectId]?.status === "loading";

  return {
    archiveDisabled: dangerLoading || Boolean(danger && !danger.archiveAction.enabled),
    deleteDisabled: dangerLoading || Boolean(danger && !danger.deleteAction.enabled),
  };
}

export function useProjectMenuActions({
  workspaceId,
  t,
  onEnterProject,
  onManageProject,
  onArchiveSuccess,
  onDeleteSuccess,
}: UseProjectMenuActionsOptions) {
  const queryClient = useQueryClient();
  const [confirmArchive, setConfirmArchive] = useState<ProjectDangerTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectDangerTarget | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectField, setEditingProjectField] = useState<ProjectEditingField | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [editingProjectDescription, setEditingProjectDescription] = useState("");
  const [iconDialogProject, setIconDialogProject] = useState<UserCenterProjectListItem | null>(
    null,
  );
  const [isProjectEditNavigationSuppressed, setIsProjectEditNavigationSuppressed] = useState(false);
  const [projectDangerCapabilities, setProjectDangerCapabilities] = useState<
    Record<string, ProjectDangerCapabilityState | undefined>
  >({});
  const [iconDialogValues, setIconDialogValues] = useState<ProjectIconDialogValues>({
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
  });
  const editNavigationTimerRef = useRef<number | null>(null);

  const mutations = useUserCenterProjectsMutations({
    workspaceId,
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

  const fetchProjectDangerCapabilities = useCallback(
    async (projectId: string) =>
      queryClient.fetchQuery({
        queryKey: projectDangerCapabilitiesKey(projectId),
        queryFn: async () => getProjectDangerCapabilities(projectId),
      }),
    [queryClient],
  );

  const prepareProjectDangerCapabilities = useCallback(
    (projectId: string) => {
      void queryClient.ensureQueryData({
        queryKey: projectDangerCapabilitiesKey(projectId),
        queryFn: async () => getProjectDangerCapabilities(projectId),
      });
    },
    [queryClient],
  );

  const prefetchProjectDangerCapabilities = useCallback(
    async (projectId: string) => {
      const cached = queryClient.getQueryData<ProjectDangerCapabilities>(
        projectDangerCapabilitiesKey(projectId),
      );
      if (cached) {
        setProjectDangerCapabilities((prev) => ({
          ...prev,
          [projectId]: { status: "ready", data: cached },
        }));
        return cached;
      }

      if (projectDangerCapabilities[projectId]?.status === "loading") {
        return null;
      }

      setProjectDangerCapabilities((prev) => ({
        ...prev,
        [projectId]: { status: "loading", data: null },
      }));

      try {
        const danger = await fetchProjectDangerCapabilities(projectId);
        setProjectDangerCapabilities((prev) => ({
          ...prev,
          [projectId]: { status: "ready", data: danger },
        }));
        return danger;
      } catch {
        setProjectDangerCapabilities((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
        return null;
      }
    },
    [fetchProjectDangerCapabilities, projectDangerCapabilities, queryClient],
  );

  const guardProjectDangerAction = useCallback(
    async (projectId: string, action: "archive" | "delete") => {
      try {
        const danger = await fetchProjectDangerCapabilities(projectId);
        const guard = action === "archive" ? danger.archiveAction : danger.deleteAction;
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
    [fetchProjectDangerCapabilities, t],
  );

  const suppressProjectEditNavigation = useCallback(() => {
    if (editNavigationTimerRef.current) {
      window.clearTimeout(editNavigationTimerRef.current);
    }

    setIsProjectEditNavigationSuppressed(true);
    editNavigationTimerRef.current = window.setTimeout(() => {
      setIsProjectEditNavigationSuppressed(false);
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

  const unarchiveProject = useCallback(
    (projectId: string) => {
      void mutations.unarchiveMutation.mutateAsync(projectId);
    },
    [mutations.unarchiveMutation],
  );

  const requestArchiveProject = useCallback(
    async (project: ProjectDangerTarget) => {
      const allowed = await guardProjectDangerAction(project.projectId, "archive");
      if (!allowed) return;
      setConfirmArchive(project);
    },
    [guardProjectDangerAction],
  );

  const requestDeleteProject = useCallback(
    async (project: ProjectDangerTarget) => {
      const allowed = await guardProjectDangerAction(project.projectId, "delete");
      if (!allowed) return;
      setDeleteConfirmName("");
      setConfirmDelete(project);
    },
    [guardProjectDangerAction],
  );

  const startEditingProjectField = useCallback(
    (project: UserCenterProjectListItem, field: ProjectEditingField) => {
      setEditingProjectId(project.projectId);
      setEditingProjectField(field);
      setEditingProjectName(project.name);
      setEditingProjectDescription(normalizeProjectDescription(project.description));
      setIsProjectEditNavigationSuppressed(false);
    },
    [],
  );

  const startRenameProject = useCallback(
    (project: UserCenterProjectListItem) => {
      startEditingProjectField(project, "name");
    },
    [startEditingProjectField],
  );

  const startEditProjectDescription = useCallback(
    (project: UserCenterProjectListItem) => {
      startEditingProjectField(project, "description");
    },
    [startEditingProjectField],
  );

  const cancelProjectEdit = useCallback(() => {
    setEditingProjectField(null);
    setEditingProjectId(null);
    setEditingProjectName("");
    setEditingProjectDescription("");
  }, []);

  const commitProjectEdit = useCallback(
    async (project: UserCenterProjectListItem, field: ProjectEditingField) => {
      if (editingProjectId !== project.projectId) return;
      if (editingProjectField !== field) return;

      suppressProjectEditNavigation();

      if (field === "name") {
        const nextName = editingProjectName.trim();
        if (!nextName || nextName === project.name) {
          cancelProjectEdit();
          return;
        }

        await mutations.updateMutation.mutateAsync({
          projectId: project.projectId,
          patch: { name: nextName },
        });
        cancelProjectEdit();
        return;
      }

      const nextDescription = normalizeProjectDescription(editingProjectDescription) || null;
      if ((normalizeProjectDescription(project.description) || null) === nextDescription) {
        cancelProjectEdit();
        return;
      }

      await mutations.updateMutation.mutateAsync({
        projectId: project.projectId,
        patch: { description: nextDescription },
      });
      cancelProjectEdit();
    },
    [
      cancelProjectEdit,
      editingProjectDescription,
      editingProjectField,
      editingProjectId,
      editingProjectName,
      mutations.updateMutation,
      suppressProjectEditNavigation,
    ],
  );

  const openIconDialog = useCallback((project: UserCenterProjectListItem) => {
    setIconDialogProject(project);
    setIconDialogValues(buildIconDialogValues(project));
  }, []);

  const closeIconDialog = useCallback(() => {
    setIconDialogProject(null);
  }, []);

  const saveIconDialog = useCallback(async () => {
    if (!iconDialogProject) return;

    await mutations.updateMutation.mutateAsync({
      projectId: iconDialogProject.projectId,
      patch: buildProjectIconPatch(iconDialogValues),
    });
    closeIconDialog();
  }, [closeIconDialog, iconDialogProject, iconDialogValues, mutations.updateMutation]);

  const buildMenuItems = useCallback(
    (project: UserCenterProjectListItem): ProjectMenuItem[] => {
      const { archiveDisabled, deleteDisabled } = resolveProjectDangerActionState(
        project.projectId,
        queryClient,
        projectDangerCapabilities,
      );

      if (project.isArchived) {
        return [
          {
            key: "unarchive",
            icon: <Undo2 className="size-4" />,
            label: t("account:ACCOUNT_PROJECTS_ACTION_UNARCHIVE"),
            onClick: () => unarchiveProject(project.projectId),
          },
          {
            key: "delete",
            danger: true,
            icon: <Trash2 className="size-4" />,
            label: t("account:ACCOUNT_PROJECTS_ACTION_DELETE"),
            disabled: deleteDisabled,
            onClick: () => {
              void requestDeleteProject(project);
            },
          },
        ];
      }

      return [
        {
          key: "enter",
          icon: <LogIn className="size-4" />,
          label: t("account:ACCOUNT_PROJECTS_ACTION_ENTER"),
          onClick: () => onEnterProject(project),
        },
        {
          key: "manage",
          icon: <Settings2 className="size-4" />,
          label: t("account:ACCOUNT_PROJECTS_ACTION_MANAGE"),
          onClick: () => onManageProject(project),
        },
        {
          key: "edit-project",
          icon: <Pencil className="size-4" />,
          label: t("account:ACCOUNT_PROJECTS_ACTION_EDIT_PROJECT"),
          children: [
            {
              key: "rename",
              icon: <Pencil className="size-4" />,
              label: t("account:ACCOUNT_PROJECTS_ACTION_RENAME"),
              onClick: () => startRenameProject(project),
            },
            {
              key: "edit-description",
              icon: <Pencil className="size-4" />,
              label: t("account:ACCOUNT_PROJECTS_ACTION_EDIT_DESCRIPTION"),
              onClick: () => startEditProjectDescription(project),
            },
            {
              key: "change-icon",
              icon: <Palette className="size-4" />,
              label: t("account:ACCOUNT_PROJECTS_ACTION_CHANGE_ICON"),
              onClick: () => openIconDialog(project),
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
          label: t("account:ACCOUNT_PROJECTS_ACTION_ARCHIVE_TRASH"),
          children: [
            {
              key: "archive",
              icon: <Archive className="size-4" />,
              label: t("account:ACCOUNT_PROJECTS_ACTION_ARCHIVE"),
              disabled: archiveDisabled,
              onClick: () => {
                void requestArchiveProject(project);
              },
            },
            {
              key: "delete",
              danger: true,
              icon: <Trash2 className="size-4" />,
              label: t("account:ACCOUNT_PROJECTS_ACTION_DELETE"),
              disabled: deleteDisabled,
              onClick: () => {
                void requestDeleteProject(project);
              },
            },
          ],
        },
      ];
    },
    [
      onEnterProject,
      onManageProject,
      openIconDialog,
      projectDangerCapabilities,
      queryClient,
      requestArchiveProject,
      requestDeleteProject,
      startEditProjectDescription,
      startRenameProject,
      t,
      unarchiveProject,
    ],
  );

  return {
    buildMenuItems,
    mutations,
    editingProjectId,
    editingProjectField,
    editingProjectName,
    editingProjectDescription,
    setEditingProjectName,
    setEditingProjectDescription,
    startEditingProjectField,
    startRenameProject,
    startEditProjectDescription,
    cancelProjectEdit,
    commitProjectEdit,
    prefetchProjectDangerCapabilities,
    prepareProjectDangerCapabilities,
    iconDialog: {
      project: iconDialogProject,
      setProject: setIconDialogProject,
      values: iconDialogValues,
      setValues: setIconDialogValues,
      pending: mutations.updateMutation.isPending,
      onConfirm: saveIconDialog,
      onClose: closeIconDialog,
    },
    isProjectEditNavigationSuppressed,
    archiveDialog: {
      project: confirmArchive,
      setProject: setConfirmArchive,
      pending: mutations.archiveMutation.isPending,
      onConfirm: async (projectId: string) => {
        try {
          await mutations.archiveMutation.mutateAsync(projectId);
        } catch (error) {
          notifyError(error);
          throw error;
        }
      },
    },
    deleteDialog: {
      project: confirmDelete,
      setProject: setConfirmDelete,
      confirmName: deleteConfirmName,
      setConfirmName: setDeleteConfirmName,
      confirmMatches: deleteConfirmName.trim() === (confirmDelete?.name || ""),
      pending: mutations.deleteMutation.isPending,
      onConfirm: async (payload: { projectId: string; confirmName: string }) => {
        try {
          await mutations.deleteMutation.mutateAsync(payload);
        } catch (error) {
          notifyError(error);
          throw error;
        }
      },
    },
  } as const;
}
