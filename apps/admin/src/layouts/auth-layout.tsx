import { lazy, Suspense, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";

import { AUTH_SCENE_BEND_PROPS } from "@/constants/color-bends";
import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { RouteTransition } from "@/components/layout/route-transition";
import { useLockViewport } from "@celestial/hooks/use-lock-viewport";
import { useMediaQuery } from "@celestial/hooks/use-media-query";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const ColorBendsLazy = lazy(() => import("@celestial/ui/color-bends"));

export function AuthLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();

  const reducedMotion = usePrefersReducedMotion();
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  useLockViewport();

  return (
    <div className="fixed inset-0 grid w-full grid-cols-1 overflow-hidden bg-background text-label-primary lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-end p-4">
        <div className="flex items-center gap-2 pointer-events-auto">
          <AdminLocaleToggle />
          <AdminThemeModeToggle />
        </div>
      </div>

      <div className="relative hidden h-full min-h-0 overflow-hidden bg-background lg:block">
        {isLargeScreen && !reducedMotion ? (
          <Suspense
            fallback={<div className="absolute inset-0 bg-background animate-pulse opacity-50" />}
          >
            <ColorBendsLazy {...AUTH_SCENE_BEND_PROPS} />
          </Suspense>
        ) : null}

        <div className="absolute inset-0 flex items-end p-14">
          <div className="max-w-120 select-none">
            <div className="text-largetitle">{t("auth:SLOGAN_TITLE")}</div>
            <p className="text-title2 text-label-secondary">{t("auth:SLOGAN_SUBTITLE")}</p>
          </div>
        </div>
      </div>

      <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-8 py-10 lg:px-10 xl:px-14">
          <div className="w-full max-w-96">
            <RouteTransition className="w-full" variant="fade">
              {children}
            </RouteTransition>
          </div>
        </div>
      </div>
    </div>
  );
}
