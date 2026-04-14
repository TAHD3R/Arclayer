import { useCallback } from "react";
import { useNavigate, useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  buildUsercenterOverlayNavigate,
  isUsercenterOverlayTab,
} from "@/lib/routing/usercenter-overlay";
import {
  getUsercenterOverlayItem,
  USERCENTER_OVERLAY_ITEMS,
} from "@/pages/usercenter/shared/usercenter-overlay-registry";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";

export function UsercenterOverlayHost() {
  const { t } = useTranslation(["account"]);
  const { usercenter } = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      hash: state.location.hash,
    }),
    structuralSharing: true,
  });

  const activeTab = usercenter ?? null;
  const activeItem = activeTab ? getUsercenterOverlayItem(activeTab) : null;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open || !activeTab) return;
      const historyIndex =
        typeof window !== "undefined"
          ? (window.history.state as { __TSR_index?: number } | null)?.__TSR_index
          : undefined;
      if (historyIndex === 0) {
        void navigate({ to: "/", replace: true });
        return;
      }
      router.history.back();
    },
    [activeTab, navigate, router],
  );

  const handleTabChange = useCallback(
    (nextValue: string) => {
      if (!isUsercenterOverlayTab(nextValue)) return;
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

  if (!activeItem) return null;

  return (
    <ExpandableScreen
      expanded
      onExpandChange={handleOpenChange}
      layoutId="global-usercenter-overlay"
    >
      <ExpandableScreenContent className="border border-border/80 bg-background shadow-2xl">
        <ChromeTabs
          value={activeItem.tab}
          onValueChange={handleTabChange}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="border-b border-border/70 px-6 pt-6 sm:px-8 sm:pt-8">
            <div className="max-w-3xl pr-12 sm:pr-16">
              <div className="text-title font-semibold text-label-primary">
                {t(activeItem.titleKey)}
              </div>
              <p className="mt-2 text-body text-label-secondary">{t(activeItem.descriptionKey)}</p>
            </div>
            <div className="mt-5">
              <ChromeTabsList className="w-auto">
                {USERCENTER_OVERLAY_ITEMS.map((item) => (
                  <ChromeTabsTrigger key={item.tab} value={item.tab}>
                    {t(item.labelKey)}
                  </ChromeTabsTrigger>
                ))}
              </ChromeTabsList>
            </div>
          </div>

          <div
            data-testid="usercenter-overlay-scroll-region"
            className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8"
          >
            <div className="mx-auto w-full max-w-5xl">{activeItem.render()}</div>
          </div>
        </ChromeTabs>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}
