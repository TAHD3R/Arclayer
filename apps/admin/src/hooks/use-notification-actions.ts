import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  archiveNotification,
  deleteNotification,
  markNotificationRead,
  recordNotificationInteraction,
} from "@/api/notifications";
import { listMyWorkspaces } from "@/api/workspaces";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { notifyErrorText } from "@/lib/notifications";
import {
  canAccessNotificationNavigationTarget,
  resolveNotificationNavigationTarget,
  type NotificationNavigationTarget,
} from "@/lib/routing/notification-target";
import type { NotificationOut as NotificationItem } from "@arclayer/openapi";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type OpenNotificationTargetOptions = {
  markRead?: boolean;
  target?: NotificationNavigationTarget;
};

export function useNotificationActions() {
  const { t } = useTranslation("notifications");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settingsScreen = useSettingsScreen();
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

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
  const accessibleProjectIds = useMemo(
    () =>
      new Set(
        (workspacesQuery.data?.items ?? [])
          .map((item) => item.projectId)
          .filter((projectId): projectId is string => typeof projectId === "string"),
      ),
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

  const recordInteraction = useCallback(
    async (item: NotificationItem, interaction: "click" | "dismiss") => {
      await recordNotificationInteraction(item.id, interaction);
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
    async (item: NotificationItem, options: OpenNotificationTargetOptions = {}) => {
      const navigationTarget = options.target ?? item.target;
      const target = resolveNotificationNavigationTarget(navigationTarget);
      const isAccessible = canAccessNotificationNavigationTarget({
        notificationWorkspaceId: item.workspaceId,
        currentWorkspaceId,
        target: navigationTarget,
        accessibleWorkspaceIds,
        accessibleProjectIds,
      });
      if (workspacesQuery.isSuccess && !isAccessible) {
        notifyErrorText(t("NOTIFICATIONS_TARGET_FORBIDDEN"));
        return false;
      }

      if ((options.markRead ?? true) && !item.readAt) {
        await markRead(item);
      }

      if (target.type === "settings") {
        settingsScreen.openSettings(target.target);
        return true;
      }
      if (target.type === "feedback") {
        await navigate({ to: "/notifications", search: { ticketId: target.ticketId } });
        return true;
      }

      await navigate({ to: target.to as never });
      return true;
    },
    [
      accessibleWorkspaceIds,
      accessibleProjectIds,
      currentWorkspaceId,
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
    recordInteraction,
    workspacesQuery,
  };
}
