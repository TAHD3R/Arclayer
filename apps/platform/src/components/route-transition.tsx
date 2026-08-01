import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PageSkeleton, type PageSkeletonVariant } from "@arclayer/ui/page-skeleton";

function resolvePlatformSkeletonVariant(routeId: string | undefined, pathname: string) {
  const routeKey = routeId ?? pathname;

  if (routeKey.includes("/sign-in") || routeKey.includes("/setup")) {
    return "form" satisfies PageSkeletonVariant;
  }
  if (routeKey.includes("/invitations/$invitationId")) {
    return "split-detail" satisfies PageSkeletonVariant;
  }
  if (routeKey === "/" || routeKey === "/_authenticated/" || routeKey.includes("/attention")) {
    return "card-grid" satisfies PageSkeletonVariant;
  }
  return "table" satisfies PageSkeletonVariant;
}

export function RouteTransition({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const { isLoading, pathname, routeId } = useRouterState({
    select: (state) => ({
      isLoading: state.isLoading || state.matches.some((match) => match.status === "pending"),
      pathname: state.location.pathname,
      routeId: [...state.matches].reverse().find((match) => match.routeId)?.routeId,
    }),
    structuralSharing: true,
  });
  const skeletonVariant = resolvePlatformSkeletonVariant(routeId, pathname);

  return (
    <div
      aria-busy={isLoading}
      className="relative flex min-h-0 min-w-0 w-full flex-1 flex-col bg-background"
    >
      <div
        aria-hidden={isLoading || undefined}
        className={
          isLoading
            ? "invisible flex min-h-0 min-w-0 w-full flex-1 flex-col pointer-events-none"
            : "flex min-h-0 min-w-0 w-full flex-1 flex-col"
        }
        data-slot="route-content"
        inert={isLoading || undefined}
      >
        {children}
      </div>
      {isLoading ? (
        <div
          aria-label={t("LOADING")}
          aria-live="polite"
          className="absolute inset-0 z-10 min-h-full overflow-hidden bg-background"
          role="status"
        >
          <PageSkeleton className="p-4 sm:p-6" variant={skeletonVariant} />
        </div>
      ) : null}
    </div>
  );
}
