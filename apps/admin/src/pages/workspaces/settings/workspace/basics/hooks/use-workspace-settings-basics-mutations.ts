import { useMutation, type QueryClient } from "@tanstack/react-query";

import { patchCoreSettings } from "@/api/settings";
import {
  assignWorkspaceRoleToAllUsers,
  patchWorkspaceDetail,
  patchWorkspaceRolePolicy,
} from "@/api/workspaces";
import { notifyError, notifySuccessText } from "@/lib/notifications";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function useWorkspaceSettingsBasicsMutations(options: {
  workspaceId: string;
  t: TranslateFn;
  queryClient: QueryClient;
}) {
  const { workspaceId, t, queryClient } = options;

  const patchWorkspaceMutation = useMutation({
    mutationFn: async (patch: {
      name?: string;
      description?: string | null;
      slug?: string;
      iconMode?: "initials" | "glyph" | "emoji" | "image";
      iconColor?: string | null;
      iconGlyph?: string | null;
      iconEmoji?: string | null;
      iconUrl?: string | null;
    }) => patchWorkspaceDetail(workspaceId, patch),
    onSuccess: async (data) => {
      const aligned = Boolean(data?.iconAssetAligned);
      notifySuccessText(
        aligned ? t("settings:SETTINGS_SAVED_ASSET_ALIGNED") : t("settings:SETTINGS_SAVED"),
      );
      await queryClient.invalidateQueries({ queryKey: ["workspace", "detail", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] });
    },
    onError: (err) => notifyError(err),
  });

  const patchWorkspaceCoreMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => patchCoreSettings(workspaceId, patch),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["settings", "workspace", "core", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const patchWorkspaceRolePolicyMutation = useMutation({
    mutationFn: async (input: { defaultRoleCode: string }) =>
      patchWorkspaceRolePolicy(workspaceId, input),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "rbac", "roles", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const assignWorkspaceRoleMutation = useMutation({
    mutationFn: async (input: { roleCode: string; confirmName: string }) =>
      assignWorkspaceRoleToAllUsers(workspaceId, input),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "rbac", "roles", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  return {
    patchWorkspaceMutation,
    patchWorkspaceCoreMutation,
    patchWorkspaceRolePolicyMutation,
    assignWorkspaceRoleMutation,
  };
}
