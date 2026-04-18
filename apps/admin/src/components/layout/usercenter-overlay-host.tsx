import { useCallback } from "react";
import { useNavigate, useRouter, useRouterState, useSearch } from "@tanstack/react-router";

import {
  buildUsercenterOverlayNavigate,
  isSettingsOverlayTab,
  resolveSettingsOverlayTabFromPath,
} from "@/lib/routing/usercenter-overlay";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import { getUsercenterOverlayItem } from "@/pages/usercenter/shared/usercenter-overlay-registry";
import { SettingsFrame } from "@/pages/settings/settings-shell";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { AdminNavItem } from "@/types/admin-nav";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";

export function UsercenterOverlayHost() {
  const { personalSettings } = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      hash: state.location.hash,
    }),
    structuralSharing: true,
  });

  const activeTab = personalSettings ?? null;
  const activeItem = activeTab ? getUsercenterOverlayItem(activeTab) : null;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open || !activeTab) return;
      const historyIndex =
        typeof window !== "undefined"
          ? (window.history.state as { __TSR_index?: number } | null)?.__TSR_index
          : undefined;
      if (historyIndex === 0) {
        const projectId =
          useWorkspaceStore.getState().currentProjectId ??
          useWorkspaceStore.getState().lastProjectId;
        void navigate({
          to: (projectId ? `${projectHomePath(projectId)}/` : "/") as never,
          replace: true,
        });
        return;
      }
      router.history.back();
    },
    [activeTab, navigate, router],
  );

  const handleTabChange = useCallback(
    (nextValue: string) => {
      if (!isSettingsOverlayTab(nextValue)) return;
      void navigate(
        buildUsercenterOverlayNavigate({
          currentLocation: location,
          tab: nextValue,
          replace: true,
        }),
      );
    },
    [location, navigate],
  );

  const handleItemSelect = useCallback(
    (item: AdminNavItem) => {
      const nextTab = item.to ? resolveSettingsOverlayTabFromPath(item.to) : null;
      if (!nextTab) return;
      handleTabChange(nextTab);
    },
    [handleTabChange],
  );

  if (!activeItem) return null;

  return (
    <ExpandableScreen
      expanded
      onExpandChange={handleOpenChange}
      layoutId="global-usercenter-overlay"
    >
      <ExpandableScreenContent
        showCloseButton={false}
        className="border border-border/80 bg-background shadow-2xl"
      >
        <SettingsFrame
          activePath={activeItem.to}
          activeTab={activeItem.tab}
          expandedGutters
          onClose={() => handleOpenChange(false)}
          onSelectItem={handleItemSelect}
          className="h-full w-full max-w-none rounded-none border-0 shadow-none"
        >
          {activeItem.render()}
        </SettingsFrame>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}
