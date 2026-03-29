import type { PropsWithChildren } from "react";
import { Trans } from "react-i18next";

import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { useLockViewport } from "@arclayer/hooks/use-lock-viewport";

export function SetupLayout({ children }: PropsWithChildren) {
  useLockViewport();

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-card text-label-primary">
      <div className="absolute inset-0 bg-card" />

      <div className="absolute top-0 right-0 p-4 z-30">
        <div className="flex items-center gap-1.5">
          <AdminLocaleToggle />
          <AdminThemeModeToggle />
        </div>
      </div>

      <div className="relative z-10 h-full w-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          <div className="w-full max-w-6xl max-h-full overflow-auto">{children}</div>
        </div>

        <div className="pb-6 text-center text-caption text-label-secondary select-none">
          <Trans
            i18nKey="auth:FOOTER_COPYRIGHT"
            components={{
              brand: <span className="text-label-primary">Arclayer</span>,
            }}
          />
        </div>
      </div>
    </div>
  );
}
