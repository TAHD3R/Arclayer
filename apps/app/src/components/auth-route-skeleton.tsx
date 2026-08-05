import { Skeleton } from "@arclayer/ui/skeleton";

export function AuthRouteSkeleton() {
  return (
    <div
      data-testid="auth-route-skeleton"
      className="flex size-full items-center justify-center"
      aria-hidden="true"
    >
      <div className="grid w-full max-w-[25.875rem] justify-items-center gap-6">
        <Skeleton className="size-12 rounded-2xl md:size-16" />
        <div className="grid w-full justify-items-center gap-0.5">
          <Skeleton className="h-9 w-56 max-w-[75%] rounded-full" />
          <Skeleton className="h-9 w-80 max-w-[90%] rounded-full" />
        </div>
        <div className="grid w-full gap-4 md:px-8">
          <Skeleton className="h-14 w-full rounded-full" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-14 rounded-full" />
            <Skeleton className="h-14 rounded-full" />
            <Skeleton className="h-14 rounded-full" />
          </div>
          <div className="flex items-center gap-3 py-1">
            <Skeleton className="h-0.5 flex-1 rounded-full" />
            <Skeleton className="h-4 w-5 rounded-full" />
            <Skeleton className="h-0.5 flex-1 rounded-full" />
          </div>
          <Skeleton className="h-14 w-full rounded-full" />
          <Skeleton className="mx-auto h-4 w-3/4 rounded-full" />
        </div>
      </div>
    </div>
  );
}
