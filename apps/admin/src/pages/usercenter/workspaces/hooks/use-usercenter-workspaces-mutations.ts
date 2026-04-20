import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  archiveOrganizationWorkspace,
  createOrganizationWorkspace,
  deleteOrganizationWorkspace,
  unarchiveOrganizationWorkspace,
} from "@/api/organization-workspaces";
import { ApiError } from "@/lib/http";
import { patchWorkspaceDetail } from "@/api/workspaces";
import { notifyError, notifyErrorText, notifySuccessText } from "@/lib/notifications";

import type { UserCenterWorkspacesTranslateFn } from "../types";

export type CreateWorkspacePayload = {
  name: string;
  description?: string;
};

type DeleteWorkspacePayload = {
  workspaceId: string;
  confirmName: string;
};

export type UpdateWorkspacePayload = {
  workspaceId: string;
  patch: {
    name?: string;
    description?: string | null;
    iconMode?: "initials" | "glyph" | "emoji" | "image";
    iconColor?: string | null;
    iconGlyph?: string | null;
    iconEmoji?: string | null;
    iconUrl?: string | null;
  };
};

interface UseUserCenterWorkspacesMutationsOptions {
  organizationId?: string;
  t: UserCenterWorkspacesTranslateFn;
  onCreateSuccess: () => void;
  onArchiveSuccess: () => void;
  onDeleteSuccess: () => void;
}

export function useUserCenterWorkspacesMutations(options: UseUserCenterWorkspacesMutationsOptions) {
  const { organizationId, t, onCreateSuccess, onArchiveSuccess, onDeleteSuccess } = options;
  const queryClient = useQueryClient();

  const tableScope = organizationId ? `org:${organizationId}` : "org:me";
  const cardScope = organizationId ?? "me";
  const activeTableKey = ["dataTable", `organization-workspaces-active:${tableScope}`] as const;
  const archivedTableKey = ["dataTable", `organization-workspaces-archived:${tableScope}`] as const;
  const cardsKey = ["organization-workspaces-cards", cardScope] as const;

  const invalidateWorkspaceTables = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: activeTableKey }),
      queryClient.invalidateQueries({ queryKey: archivedTableKey }),
      queryClient.invalidateQueries({ queryKey: cardsKey }),
      queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["organization", "workspaces", "switcher"] }),
      queryClient.invalidateQueries({ queryKey: ["global-nav", "workspaces"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: CreateWorkspacePayload) => {
      const nextName = payload.name.trim();

      if (!nextName) {
        throw new Error("WORKSPACE_NAME_REQUIRED");
      }

      return createOrganizationWorkspace(organizationId, {
        name: nextName,
        description: payload.description,
        template: "blank",
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      onCreateSuccess();
      await invalidateWorkspaceTables();
    },
    onError: (error) => {
      const message = resolveWorkspaceCreateErrorMessage(error, t);
      if (message) {
        notifyErrorText(message);
        return;
      }
      notifyError(error);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (workspaceId: string) =>
      archiveOrganizationWorkspace(organizationId, workspaceId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      onArchiveSuccess();
      await invalidateWorkspaceTables();
    },
    onError: (error) => notifyError(error),
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (workspaceId: string) =>
      unarchiveOrganizationWorkspace(organizationId, workspaceId),
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

  const updateMutation = useMutation({
    mutationFn: async (payload: UpdateWorkspacePayload) =>
      patchWorkspaceDetail(payload.workspaceId, payload.patch),
    onSuccess: async (_result, payload) => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await Promise.all([
        invalidateWorkspaceTables(),
        queryClient.invalidateQueries({ queryKey: ["workspace", "detail", payload.workspaceId] }),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  return {
    createMutation,
    archiveMutation,
    unarchiveMutation,
    deleteMutation,
    updateMutation,
  } as const;
}

function resolveWorkspaceCreateErrorMessage(
  error: unknown,
  t: UserCenterWorkspacesTranslateFn,
): string | null {
  const errorCode =
    error instanceof ApiError ? error.error : error instanceof Error ? error.message : null;
  if (!errorCode) return null;
  if (errorCode === "WORKSPACE_NAME_REQUIRED") {
    return t("common:ORG_WORKSPACES_FIELD_NAME_REQUIRED");
  }
  return null;
}
