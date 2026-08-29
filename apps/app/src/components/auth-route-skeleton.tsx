import { Skeleton } from "@arclayer/ui/skeleton";

export function AuthRouteSkeleton() {
  return (
    <div
      data-testid="auth-route-skeleton"
      className="flex size-full items-center justify-center"
      aria-hidden="true"
    >
      <div className="grid w-full max-w-[25.875rem] justify-items-center gap-8">
        <Skeleton className="size-12 rounded-2xl md:size-16" />
        <div className="grid w-full justify-items-center gap-0.5">
          <Skeleton className="h-9 w-56 max-w-[75%] rounded-full" />
          <Skeleton className="h-9 w-80 max-w-[90%] rounded-full" />
        </div>
        <div className="grid w-full gap-8">
          <div className="grid gap-2.5">
            <Skeleton className="h-10 w-full rounded-md" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-10 rounded-md" />
              <Skeleton className="h-10 rounded-md" />
              <Skeleton className="h-10 rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-3 py-1">
            <Skeleton className="h-0.5 flex-1 rounded-full" />
            <Skeleton className="h-4 w-5 rounded-full" />
            <Skeleton className="h-0.5 flex-1 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="mx-auto h-4 w-3/4 rounded-full" />
        </div>
      </div>
    </div>
  );
}
