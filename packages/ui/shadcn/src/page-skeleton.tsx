import { cn } from "@arclayer/lib/utils";
import { Skeleton } from "@arclayer/ui/skeleton";

export type PageSkeletonVariant = "form" | "masonry" | "table";

export type PageSkeletonProps = {
  variant: PageSkeletonVariant;
  className?: string;
};

function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MasonrySkeleton() {
  // 不是严格等价 Masonry，但足够表达“资产卡片网格加载中”，且不依赖具体数据结构。
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  // 通用表格骨架：header + rows（列宽用比例模拟，适配不同 table 场景）
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-12 gap-3 border-b px-4 py-3">
          <Skeleton className="col-span-3 h-4" />
          <Skeleton className="col-span-3 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
        </div>

        <div className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-12 gap-3 px-4 py-3">
              <Skeleton className="col-span-3 h-4" />
              <Skeleton className="col-span-3 h-4" />
              <Skeleton className="col-span-2 h-4" />
              <Skeleton className="col-span-2 h-4" />
              <Skeleton className="col-span-2 h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton(props: PageSkeletonProps) {
  return (
    <div className={cn("w-full", props.className)}>
      {props.variant === "form" ? (
        <FormSkeleton />
      ) : props.variant === "masonry" ? (
        <MasonrySkeleton />
      ) : (
        <TableSkeleton />
      )}
    </div>
  );
}
