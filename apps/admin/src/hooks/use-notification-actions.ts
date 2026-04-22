import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { archiveNotification, deleteNotification, markNotificationRead } from "@/api/notifications";
import { listMyWorkspaces } from "@/api/workspaces";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { notifyErrorText } from "@/lib/notifications";
import { resolveNotificationTarget } from "@/lib/routing/notification-target";
import type { NotificationItem } from "@/types/api";

export function useNotificationActions() {
  const { t } = useTranslation("notifications");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settingsScreen = useSettingsScreen();

  const workspacesQuery = useQuery({
    queryKey: ["workspaces", "me", "list", "notifications"],
    queryFn: listMyWorkspaces,
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const accessibleWorkspaceIds = useMemo(
    () => new Set((workspacesQuery.data?.items ?? []).map((item) => String(item.workspaceId))),
    [workspacesQuery.data?.items],
  );

  const invalidateNotifications = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  const markRead = useCallback(
    async (item: NotificationItem) => {
      if (item.readAt) return true;
      await markNotificationRead(item.id);
      await invalidateNotifications();
      return true;
    },
    [invalidateNotifications],
  );

  const archiveItem = useCallback(
    async (item: NotificationItem) => {
      await archiveNotification(item.id);
      await invalidateNotifications();
      return true;
    },
    [invalidateNotifications],
  );

  const deleteItem = useCallback(
    async (item: NotificationItem) => {
      await deleteNotification(item.id);
      await invalidateNotifications();
      return true;
    },
    [invalidateNotifications],
  );

  const openTarget = useCallback(
    async (item: NotificationItem) => {
      const target = resolveNotificationTarget(item);
      if (!target) return false;

      const isAccessibleWorkspace = accessibleWorkspaceIds.has(String(item.workspaceId));
      if (workspacesQuery.isSuccess && !isAccessibleWorkspace) {
        notifyErrorText(t("NOTIFICATIONS_TARGET_FORBIDDEN"));
        return false;
      }

      if (!item.readAt) {
        await markRead(item);
      }

      if (target.type === "settings") {
        settingsScreen.openSettings(target.target);
        return true;
      }

      void navigate({ to: target.to as never });
      return true;
    },
    [
      accessibleWorkspaceIds,
      markRead,
      navigate,
      settingsScreen.openSettings,
      t,
      workspacesQuery.isSuccess,
    ],
  );

  return {
    archiveItem,
    deleteItem,
    markRead,
    openTarget,
    workspacesQuery,
  };
}
