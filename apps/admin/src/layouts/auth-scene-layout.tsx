import type { PropsWithChildren, ReactNode } from "react";

import { AdminFullLogo } from "@/components/layout/admin-logo";
import { RouteTransition } from "@/components/layout/route-transition";
import { cn } from "@arclayer/lib/utils";
import { useLockViewport } from "@arclayer/hooks/use-lock-viewport";

export function AuthSceneLayout(
  props: PropsWithChildren<{
    logoTo: string;
    footer: ReactNode;
    contentClassName?: string;
    contentMaxClassName?: string;
    headerLeading?: ReactNode;
    headerAfterLogo?: ReactNode;
    hideLogo?: boolean;
    withRouteTransition?: boolean;
  }>,
) {
  useLockViewport();

  const content = (
    <div className={cn("w-full", props.contentMaxClassName ?? "max-w-90")}>
      {props.withRouteTransition ? (
        <RouteTransition className="w-full" variant="fade">
          {props.children}
        </RouteTransition>
      ) : (
        props.children
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-background text-label-primary">
      <div className="relative flex shrink-0 flex-col items-center justify-center px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
        {props.headerLeading ? (
          <div
            data-testid="auth-scene-header-leading"
            className="absolute top-4 left-4 sm:top-5 sm:left-5"
          >
            {props.headerLeading}
          </div>
        ) : null}
        {props.hideLogo ? null : (
          <div className="flex select-none justify-center">
            <AdminFullLogo to={props.logoTo} ariaLabel="Arclayer" width={132} />
          </div>
        )}
        {props.headerAfterLogo ? (
          <div
            data-testid="auth-scene-header-after-logo"
            className={cn("flex justify-center", props.hideLogo ? "mt-0" : "mt-5")}
          >
            {props.headerAfterLogo}
          </div>
        ) : null}
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-y-auto">
        <div
          data-testid="auth-scene-content"
          className={cn(
            "flex min-h-full w-full flex-1 items-start justify-center px-6 pt-[clamp(1.5rem,6vh,4rem)] pb-[clamp(1.5rem,6vh,4rem)] sm:px-12",
            props.contentClassName,
          )}
        >
          {content}
        </div>
      </div>

      {props.footer}
    </div>
  );
}
