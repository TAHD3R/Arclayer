import type { PropsWithChildren } from "react";

import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { RouteTransition } from "@/components/layout/route-transition";
import { useLockViewport } from "@arclayer/hooks/use-lock-viewport";

export function AuthLayout({ children }: PropsWithChildren) {
  useLockViewport();

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-card text-label-primary">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex shrink-0 items-center justify-end p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <AdminLocaleToggle />
          <AdminThemeModeToggle />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full w-full flex-1 items-center justify-center px-6 pt-20 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-8 sm:pt-24 sm:pb-10 lg:px-10">
          <div className="w-full max-w-100">
            <RouteTransition className="w-full" variant="fade">
              {children}
            </RouteTransition>
          </div>
        </div>
      </div>
    </div>
  );
}
