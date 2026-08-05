import type { PropsWithChildren, ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { AuthRouteSkeleton } from "@/components/auth-route-skeleton";
import { RouteTransition } from "@/components/layout/route-transition";
import { cn } from "@arclayer/lib/utils";
import { useLockViewport } from "@arclayer/hooks/use-lock-viewport";

export function AuthSceneLayout(
  props: PropsWithChildren<{
    logoTo: string;
    footer: ReactNode;
    contentClassName?: string;
    contentMaxClassName?: string;
    headerLayout?: "centered" | "split";
    headerLeading?: ReactNode;
    headerTrailing?: ReactNode;
    headerAfterLogo?: ReactNode;
    background?: ReactNode;
    hideHeader?: boolean;
    hideLogo?: boolean;
    withRouteTransition?: boolean;
  }>,
) {
  useLockViewport();

  const headerLayout = props.headerLayout ?? "centered";

  const content = (
    <div className={cn("w-full", props.contentMaxClassName ?? "max-w-90")}>
      {props.withRouteTransition ? (
        <RouteTransition className="w-full" pendingFallback={<AuthRouteSkeleton />} variant="fade">
          {props.children}
        </RouteTransition>
      ) : (
        props.children
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col overflow-y-auto bg-background text-label-primary">
      {props.background ? (
        <div
          aria-hidden="true"
          data-testid="auth-scene-background"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          {props.background}
        </div>
      ) : null}
      {props.hideHeader ? null : (
        <div
          data-testid="auth-scene-header"
          className={cn(
            "relative z-10 flex shrink-0 px-4 pt-4 pb-3 sm:px-5 sm:pt-5",
            headerLayout === "split"
              ? "items-center justify-between gap-4 sm:px-6 sm:pt-6"
              : "flex-col items-center justify-center",
          )}
        >
          {props.headerLeading ? (
            <div
              data-testid="auth-scene-header-leading"
              className="absolute top-4 left-4 sm:top-5 sm:left-5"
            >
              {props.headerLeading}
            </div>
          ) : null}
          {props.hideLogo ? null : (
            <div
              className={cn(
                "flex select-none",
                headerLayout === "split" ? "justify-start" : "justify-center",
              )}
            >
              <Link
                to={props.logoTo}
                aria-label="Arclayer"
                className={cn(
                  "inline-flex h-10 items-center rounded-md px-1 text-label-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  headerLayout === "centered" ? "translate-x-px" : undefined,
                )}
              >
                <span className="sr-only">Arclayer</span>
                <svg
                  data-testid="auth-wordmark"
                  aria-hidden="true"
                  className="h-6 w-auto dark:hidden"
                  viewBox="128 20 250 64"
                >
                  <image href="/logo-full.svg" width="378" height="112" />
                </svg>
                <svg
                  aria-hidden="true"
                  className="hidden h-6 w-auto dark:block"
                  viewBox="128 20 250 64"
                >
                  <image href="/logo-full-dark.svg" width="378" height="112" />
                </svg>
              </Link>
            </div>
          )}
          {props.headerTrailing ? (
            <div data-testid="auth-scene-header-trailing" className="ml-auto flex shrink-0">
              {props.headerTrailing}
            </div>
          ) : null}
          {props.headerAfterLogo ? (
            <div
              data-testid="auth-scene-header-after-logo"
              className={cn("flex justify-center", props.hideLogo ? "mt-0" : "mt-5")}
            >
              {props.headerAfterLogo}
            </div>
          ) : null}
        </div>
      )}

      <main
        data-testid="auth-scene-content"
        className={cn(
          "relative z-10 flex w-full flex-1 items-center justify-center px-6 py-6 md:px-4 md:py-4",
          props.contentClassName,
        )}
      >
        {content}
      </main>

      {props.footer}
    </div>
  );
}
