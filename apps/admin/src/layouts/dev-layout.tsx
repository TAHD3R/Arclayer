import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";

import { AdminFullLogo } from "@/components/layout/admin-logo";
import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { RouteTransition } from "@/components/layout/route-transition";
import { DevEnvTag } from "@/components/ui/tags";

export function DevLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <AdminFullLogo to="/" ariaLabel="Arclayer" width={120} />
            <DevEnvTag label="DEV" />
            <div className="text-footnote text-label-secondary">{t("debug:DEV_TOOLS_TITLE")}</div>
          </div>
          <div className="flex items-center gap-2">
            <AdminLocaleToggle />
            <AdminThemeModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <RouteTransition className="w-full" variant="fade">
          {children}
        </RouteTransition>
      </main>
    </div>
  );
}
