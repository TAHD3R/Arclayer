import { Skeleton } from "@arclayer/ui/skeleton";

export function SettingsTableRefreshSkeleton() {
  return (
    <div aria-hidden="true" className="mb-3 rounded-lg border border-border/50 bg-background/80">
      <div className="grid grid-cols-12 gap-3 px-4 py-3">
        <Skeleton className="col-span-4 h-4" />
        <Skeleton className="col-span-3 h-4" />
        <Skeleton className="col-span-2 h-4" />
        <Skeleton className="col-span-3 h-4" />
      </div>
    </div>
  );
}
