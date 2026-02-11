import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  archiveOrganizationWorkspace,
  createOrganizationWorkspace,
  deleteOrganizationWorkspace,
  unarchiveOrganizationWorkspace,
} from "@/api/organization-workspaces";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import type { OrganizationWorkspacesTranslateFn } from "./organization-workspaces-types";

export type CreateWorkspacePayload = {
  name: string;
  description?: string;
};

type DeleteWorkspacePayload = {
  workspaceId: string;
  confirmName: string;
};

interface UseOrganizationWorkspacesMutationsOptions {
  t: OrganizationWorkspacesTranslateFn;
  onCreateSuccess: () => void;
  onArchiveSuccess: () => void;
  onDeleteSuccess: () => void;
}

export function useOrganizationWorkspacesMutations(
  options: UseOrganizationWorkspacesMutationsOptions,
) {
  const { t, onCreateSuccess, onArchiveSuccess, onDeleteSuccess } = options;
  const queryClient = useQueryClient();

  const invalidateWorkspaceTables = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-workspaces-active"] }),
      queryClient.invalidateQueries({
        queryKey: ["dataTable", "organization-workspaces-archived"],
      }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: CreateWorkspacePayload) =>
      createOrganizationWorkspace({
        name: payload.name,
        description: payload.description,
        template: "blank",
      }),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      onCreateSuccess();
      await invalidateWorkspaceTables();
    },
    onError: (error) => notifyError(error),
  });

  const archiveMutation = useMutation({
    mutationFn: async (workspaceId: string) => archiveOrganizationWorkspace(workspaceId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      onArchiveSuccess();
      await invalidateWorkspaceTables();
    },
    onError: (error) => notifyError(error),
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (workspaceId: string) => unarchiveOrganizationWorkspace(workspaceId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await invalidateWorkspaceTables();
    },
    onError: (error) => notifyError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: DeleteWorkspacePayload) =>
      deleteOrganizationWorkspace(payload.workspaceId, payload.confirmName),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      onDeleteSuccess();
      await invalidateWorkspaceTables();
    },
    onError: (error) => notifyError(error),
  });

  return {
    createMutation,
    archiveMutation,
    unarchiveMutation,
    deleteMutation,
  } as const;
}
