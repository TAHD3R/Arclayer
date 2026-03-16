import { lazy, Suspense, type PropsWithChildren } from "react";
import { Trans } from "react-i18next";

import { AUTH_SCENE_BEND_PROPS } from "@/constants/color-bends";
import { AdminFullLogo } from "@/components/layout/admin-logo";
import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { LegalFooter } from "@/components/layout/legal-footer";
import { useLockViewport } from "@arclayer/hooks/use-lock-viewport";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const ColorBendsLazy = lazy(() => import("@arclayer/ui/color-bends"));

export function InviteLayout({ children }: PropsWithChildren) {
  const reducedMotion = usePrefersReducedMotion();

  useLockViewport();

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-label-primary">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {!reducedMotion ? (
          <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
            <ColorBendsLazy {...AUTH_SCENE_BEND_PROPS} />
          </Suspense>
        ) : null}
        <div className="absolute inset-0 bg-background opacity-80" />
      </div>

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between p-4">
          <AdminFullLogo to="/login" ariaLabel="Arclayer" width={120} />
          <div className="flex items-center gap-2">
            <AdminLocaleToggle />
            <AdminThemeModeToggle />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto p-8">
          <div className="w-full max-w-120">{children}</div>
        </div>

        <div className="p-4 text-center space-y-1">
          <LegalFooter i18nKey="auth:LEGAL_CONTINUE" />
          <div className="text-caption text-label-secondary">
            <Trans
              i18nKey="auth:FOOTER_COPYRIGHT"
              components={{
                brand: <span className="text-label-primary">Arclayer</span>,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
