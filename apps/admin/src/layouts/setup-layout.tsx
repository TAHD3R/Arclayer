import { lazy, Suspense, type PropsWithChildren } from "react";
import { Trans } from "react-i18next";

import { AUTH_SCENE_BEND_PROPS } from "@/constants/color-bends";
import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { useLockViewport } from "@/hooks/use-lock-viewport";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const ColorBendsLazy = lazy(() => import("@/components/ui/color-bends"));

export function SetupLayout({ children }: PropsWithChildren) {
  const reducedMotion = usePrefersReducedMotion();

  useLockViewport();

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-background text-label-primary">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {!reducedMotion ? (
          <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
            <ColorBendsLazy {...AUTH_SCENE_BEND_PROPS} />
          </Suspense>
        ) : null}
        <div className="absolute inset-0 bg-background opacity-80" />
      </div>

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
              brand: <span className="text-foreground">Celestial CMS</span>,
            }}
          />
        </div>
      </div>
    </div>
  );
}
