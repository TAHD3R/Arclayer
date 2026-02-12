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
  organizationId?: string;
  t: OrganizationWorkspacesTranslateFn;
  onCreateSuccess: () => void;
  onArchiveSuccess: () => void;
  onDeleteSuccess: () => void;
}

export function useOrganizationWorkspacesMutations(
  options: UseOrganizationWorkspacesMutationsOptions,
) {
  const { organizationId, t, onCreateSuccess, onArchiveSuccess, onDeleteSuccess } = options;
  const queryClient = useQueryClient();

  const tableScope = organizationId ? `org:${organizationId}` : "org:me";
  const activeTableKey = ["dataTable", `organization-workspaces-active:${tableScope}`] as const;
  const archivedTableKey = ["dataTable", `organization-workspaces-archived:${tableScope}`] as const;

  const invalidateWorkspaceTables = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: activeTableKey }),
      queryClient.invalidateQueries({ queryKey: archivedTableKey }),
      queryClient.invalidateQueries({ queryKey: ["organization", "workspaces", "switcher"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: CreateWorkspacePayload) =>
      createOrganizationWorkspace(organizationId, {
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
    mutationFn: async (workspaceId: string) => archiveOrganizationWorkspace(organizationId, workspaceId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      onArchiveSuccess();
      await invalidateWorkspaceTables();
    },
    onError: (error) => notifyError(error),
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (workspaceId: string) => unarchiveOrganizationWorkspace(organizationId, workspaceId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await invalidateWorkspaceTables();
    },
    onError: (error) => notifyError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: DeleteWorkspacePayload) =>
      deleteOrganizationWorkspace(organizationId, payload.workspaceId, payload.confirmName),
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
