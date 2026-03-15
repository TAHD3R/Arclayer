import type { PropsWithChildren } from "react";

import { AuthBrandPanel } from "@/components/layout/auth-brand-panel";
import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { RouteTransition } from "@/components/layout/route-transition";
import { useLockViewport } from "@celestial/hooks/use-lock-viewport";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export function AuthLayout({ children }: PropsWithChildren) {
  const reducedMotion = usePrefersReducedMotion();

  useLockViewport();

  return (
    <div className="fixed inset-0 grid w-full grid-cols-1 overflow-hidden bg-background text-label-primary lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-end p-4">
        <div className="flex items-center gap-2 pointer-events-auto">
          <AdminLocaleToggle />
          <AdminThemeModeToggle />
        </div>
      </div>

      <AuthBrandPanel reducedMotion={reducedMotion} />

      <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-8 py-10 lg:px-10 xl:px-14">
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
