import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  unarchiveWorkspace,
} from "@/api/workspace-management";
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

export type WorkspaceArchiveTransitionPayload = {
  workspaceId: string;
  expectedRevision: number;
  operationId: string;
};

const OWNER_ARCHIVE_NOTE = "Workspace owner requested archive through workspace management.";
const OWNER_RESTORE_NOTE = "Workspace owner restored access through workspace management.";

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
  t: UserCenterWorkspacesTranslateFn;
  onCreateSuccess: () => void;
  onArchiveSuccess: () => void;
  onDeleteSuccess: () => void;
}

export function useUserCenterWorkspacesMutations(options: UseUserCenterWorkspacesMutationsOptions) {
  const { t, onCreateSuccess, onArchiveSuccess, onDeleteSuccess } = options;
  const queryClient = useQueryClient();

  const activeTableKey = ["dataTable", "workspace-management-active"] as const;
  const archivedTableKey = ["dataTable", "workspace-management-archived"] as const;
  const cardsKey = ["workspace-management-cards"] as const;

  const invalidateWorkspaceTables = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: activeTableKey }),
      queryClient.invalidateQueries({ queryKey: archivedTableKey }),
      queryClient.invalidateQueries({ queryKey: cardsKey }),
      queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace", "switcher"] }),
      queryClient.invalidateQueries({ queryKey: ["global-nav", "workspaces"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: CreateWorkspacePayload) => {
      const nextName = payload.name.trim();

      if (!nextName) {
        throw new Error("WORKSPACE_NAME_REQUIRED");
      }

      return createWorkspace({
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
    mutationFn: async (payload: WorkspaceArchiveTransitionPayload) =>
      archiveWorkspace(
        payload.workspaceId,
        {
          expectedRevision: payload.expectedRevision,
          reasonCategory: "owner_request",
          reasonCode: "owner_request",
          operatorNote: OWNER_ARCHIVE_NOTE,
        },
        payload.operationId,
      ),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      onArchiveSuccess();
      await invalidateWorkspaceTables();
    },
    onError: (error) => notifyError(error),
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (payload: WorkspaceArchiveTransitionPayload) =>
      unarchiveWorkspace(
        payload.workspaceId,
        {
          expectedRevision: payload.expectedRevision,
          operatorNote: OWNER_RESTORE_NOTE,
        },
        payload.operationId,
      ),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await invalidateWorkspaceTables();
    },
    onError: (error) => notifyError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: DeleteWorkspacePayload) =>
      deleteWorkspace(payload.workspaceId, payload.confirmName),
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
