import { useMutation, useQueryClient } from "@tanstack/react-query";

import { archiveProject, deleteProject, patchProject, unarchiveProject } from "@/api/projects";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import type { UserCenterProjectsTranslateFn } from "../types";

type DeleteProjectPayload = {
  projectId: string;
  confirmName: string;
};

export type UpdateProjectPayload = {
  projectId: string;
  patch: {
    name?: string;
    slug?: string;
    description?: string | null;
    iconMode?: "initials" | "glyph" | "emoji" | "image";
    iconColor?: string | null;
    iconGlyph?: string | null;
    iconEmoji?: string | null;
    iconUrl?: string | null;
  };
};

interface UseUserCenterProjectsMutationsOptions {
  workspaceId?: string;
  t: UserCenterProjectsTranslateFn;
  onArchiveSuccess: () => void;
  onDeleteSuccess: () => void;
}

export function useUserCenterProjectsMutations(options: UseUserCenterProjectsMutationsOptions) {
  const { workspaceId, t, onArchiveSuccess, onDeleteSuccess } = options;
  const queryClient = useQueryClient();

  const tableScope = workspaceId ? `workspace:${workspaceId}` : "all";
  const activeTableKey = ["dataTable", `projects-active:${tableScope}`] as const;
  const archivedTableKey = ["dataTable", `projects-archived:${tableScope}`] as const;
  const cardsKeyPrefix = ["projects-cards"] as const;
  const globalNavProjectsKey = ["global-nav", "projects"] as const;

  const invalidateProjectTables = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: activeTableKey }),
      queryClient.invalidateQueries({ queryKey: archivedTableKey }),
      queryClient.invalidateQueries({ queryKey: cardsKeyPrefix }),
      queryClient.invalidateQueries({ queryKey: globalNavProjectsKey }),
    ]);
  };

  const archiveMutation = useMutation({
    mutationFn: async (projectId: string) => archiveProject(projectId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      onArchiveSuccess();
      await invalidateProjectTables();
    },
    onError: (error) => notifyError(error),
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (projectId: string) => unarchiveProject(projectId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await invalidateProjectTables();
    },
    onError: (error) => notifyError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: DeleteProjectPayload) =>
      deleteProject(payload.projectId, payload.confirmName),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      onDeleteSuccess();
      await invalidateProjectTables();
    },
    onError: (error) => notifyError(error),
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: UpdateProjectPayload) =>
      patchProject(payload.projectId, payload.patch),
    onSuccess: async (_result, payload) => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await Promise.all([
        invalidateProjectTables(),
        queryClient.invalidateQueries({ queryKey: ["project", "detail", payload.projectId] }),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  return {
    archiveMutation,
    unarchiveMutation,
    deleteMutation,
    updateMutation,
  } as const;
}
