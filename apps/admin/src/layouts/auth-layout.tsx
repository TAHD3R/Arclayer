import type { PropsWithChildren } from "react";

import { AdminFullLogo } from "@/components/layout/admin-logo";
import { RouteTransition } from "@/components/layout/route-transition";
import { AuthPreferencesBar } from "@/layouts/auth-preferences-bar";
import { useLockViewport } from "@arclayer/hooks/use-lock-viewport";

export function AuthLayout({ children }: PropsWithChildren) {
  useLockViewport();

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-background text-label-primary">
      <div className="flex shrink-0 justify-center px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
        <div className="flex select-none justify-center">
          <AdminFullLogo to="/login" ariaLabel="Arclayer" width={132} />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full w-full flex-1 items-start justify-center px-6 pt-[clamp(1.5rem,6vh,4rem)] pb-[clamp(1.5rem,6vh,4rem)] sm:px-12">
          <div className="w-full max-w-90">
            <RouteTransition className="w-full" variant="fade">
              {children}
            </RouteTransition>
          </div>
        </div>
      </div>
      <AuthPreferencesBar />
    </div>
  );
}
