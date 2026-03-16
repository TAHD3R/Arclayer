import type { PropsWithChildren } from "react";

import { AuthBrandPanel } from "@/components/layout/auth-brand-panel";
import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { RouteTransition } from "@/components/layout/route-transition";
import { useLockViewport } from "@arclayer/hooks/use-lock-viewport";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export function AuthLayout({ children }: PropsWithChildren) {
  const reducedMotion = usePrefersReducedMotion();

  useLockViewport();

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-background text-label-primary lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="relative z-10 flex shrink-0 items-center justify-end p-3 sm:p-4 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-0">
        <div className="flex items-center gap-2 lg:pointer-events-auto">
          <AdminLocaleToggle />
          <AdminThemeModeToggle />
        </div>
      </div>

      <AuthBrandPanel reducedMotion={reducedMotion} />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex min-h-full flex-1 items-start justify-center px-6 pt-4 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-8 sm:pt-6 sm:pb-10 lg:items-center lg:pt-[max(2rem,env(safe-area-inset-top))] lg:pb-[max(2rem,env(safe-area-inset-bottom))] lg:px-10 xl:px-14">
          <div className="w-full max-w-[400px]">
            <RouteTransition className="w-full" variant="fade">
              {children}
            </RouteTransition>
          </div>
        </div>
      </div>
    </div>
  );
}
