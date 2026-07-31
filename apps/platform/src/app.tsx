import { RouterProvider } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { PlatformAuthProvider } from "@/auth/platform-auth";
import { PlatformPreferencesProvider } from "@/lib/preferences";
import { router } from "@/routes/-router";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

export default function App() {
  const { t } = useTranslation("common");
  return (
    <PlatformPreferencesProvider>
      <ChromeTabsProvider
        labels={{
          scrollLeftAriaLabel: t("TABS_SCROLL_LEFT"),
          scrollRightAriaLabel: t("TABS_SCROLL_RIGHT"),
        }}
      >
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </ChromeTabsProvider>
    </PlatformPreferencesProvider>
  );
}
