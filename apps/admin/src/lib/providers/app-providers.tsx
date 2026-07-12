import { ProgressProvider } from "@bprogress/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";

import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { Toaster } from "@arclayer/ui/sonner";
import { TooltipProvider } from "@arclayer/ui/tooltip";
import { queryClient } from "@/lib/query/query-client-instance";
import { usePreferencesStore } from "@/stores/use-preference-store";

export function AppProviders({ children }: PropsWithChildren) {
  const { t } = useTranslation("common");
  const userReducedMotion = usePreferencesStore((s) => s.reduceMotion);

  return (
    <ProgressProvider color="var(--primary)" height="2px">
      <QueryClientProvider client={queryClient}>
        <ChromeTabsProvider
          userReducedMotion={userReducedMotion}
          labels={{
            scrollLeftAriaLabel: t("TABS_SCROLL_LEFT"),
            scrollRightAriaLabel: t("TABS_SCROLL_RIGHT"),
          }}
        >
          <TooltipProvider>
            {children}
            <Toaster
              position="bottom-center"
              containerAriaLabel={t("TOAST_NOTIFICATIONS")}
              toastOptions={{ closeButtonAriaLabel: t("CLOSE") }}
            />
          </TooltipProvider>
        </ChromeTabsProvider>
      </QueryClientProvider>
    </ProgressProvider>
  );
}
