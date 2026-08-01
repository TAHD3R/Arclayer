import { cn } from "@arclayer/lib/utils";
import { Skeleton } from "@arclayer/ui/skeleton";

export type PageSkeletonVariant = "card-grid" | "form" | "split-detail" | "table";

export type PageSkeletonProps = {
  variant: PageSkeletonVariant;
  className?: string;
};

function PageSkeletonHeader() {
  return (
    <div
      className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between"
      data-slot="page-skeleton-header"
    >
      <div className="w-full max-w-xl space-y-3">
        <Skeleton className="h-8 w-52 max-w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
      <Skeleton className="h-9 w-28 shrink-0" />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6" data-slot="page-skeleton-form">
      <PageSkeletonHeader />
      <div
        className="grid gap-4 rounded-xl border border-border/70 p-4 sm:grid-cols-2 sm:p-6"
        data-slot="page-skeleton-form-body"
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" data-slot="page-skeleton-form-field" />
        ))}
        <Skeleton className="h-28 w-full sm:col-span-2" />
      </div>
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      data-slot="page-skeleton-card-grid"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-44 flex-col rounded-lg border border-border/70 p-4"
          data-slot="page-skeleton-card"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="size-10 rounded-sm" />
            <Skeleton className="size-6" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="mt-auto flex items-center gap-2 pt-4">
            <div className="flex -space-x-2">
              {Array.from({ length: 3 }).map((_, memberIndex) => (
                <Skeleton
                  key={memberIndex}
                  className="size-6 rounded-full ring-2 ring-background"
                />
              ))}
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-6" data-slot="page-skeleton-table">
      <PageSkeletonHeader />
      <div className="overflow-hidden rounded-xl border border-border/70">
        <div className="flex items-center justify-between gap-4 border-b border-border/70 p-4">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-24 shrink-0" />
        </div>
        <div className="space-y-px bg-border/70 p-px">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem] gap-4 bg-background p-4"
              data-slot="page-skeleton-table-row"
            >
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SplitDetailSkeleton() {
  return (
    <div
      className="grid min-h-[42rem] overflow-hidden rounded-xl border border-border/70 lg:grid-cols-[19rem_minmax(0,1fr)]"
      data-slot="page-skeleton-split-detail"
    >
      <div
        className="space-y-3 border-b border-border/70 bg-muted/30 p-4 lg:border-r lg:border-b-0"
        data-slot="page-skeleton-master"
      >
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-lg border border-border/60 p-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
      <div className="space-y-6 p-4 sm:p-6" data-slot="page-skeleton-detail">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-24 shrink-0" />
        </div>
        <div className="space-y-4 rounded-lg border border-border/70 p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton(props: PageSkeletonProps) {
  return (
    <div aria-hidden="true" className={cn("w-full", props.className)} data-slot="page-skeleton">
      {props.variant === "form" ? <FormSkeleton /> : null}
      {props.variant === "card-grid" ? <CardGridSkeleton /> : null}
      {props.variant === "split-detail" ? <SplitDetailSkeleton /> : null}
      {props.variant === "table" ? <TableSkeleton /> : null}
    </div>
  );
}
