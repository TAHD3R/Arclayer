import { useRouterState } from "@tanstack/react-router";
import { Skeleton as BoneyardSkeleton } from "boneyard-js/react";
import type { ReactNode } from "react";

import { toPlatformBoneyardRouteName } from "@/lib/boneyard";
import { PageSkeleton } from "@arclayer/ui/page-skeleton";

export function RouteTransition({ children }: { children: ReactNode }) {
  const { isLoading, pathname, routeId } = useRouterState({
    select: (state) => ({
      isLoading: state.isLoading || state.matches.some((match) => match.status === "pending"),
      pathname: state.location.pathname,
      routeId: state.matches.at(-1)?.routeId,
    }),
    structuralSharing: true,
  });

  return (
    <BoneyardSkeleton
      animate="shimmer"
      className="platform-route-boneyard flex min-h-0 min-w-0 w-full flex-1 bg-background"
      fallback={<PageSkeleton className="p-6" variant="table" />}
      loading={isLoading}
      name={toPlatformBoneyardRouteName(routeId, pathname)}
      select="viewport"
      transition={180}
    >
      {children}
    </BoneyardSkeleton>
  );
}
