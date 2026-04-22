import { cn } from "@arclayer/lib/utils";
import { Skeleton } from "@arclayer/ui/skeleton";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";

function SidebarNavRowSkeleton(props: { textWidthClassName: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-10 flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg",
        "p-2 pl-5",
        "[[data-collapsible=icon][data-motion-phase=idle]_&]:size-8 [[data-collapsible=icon][data-motion-phase=idle]_&]:mx-auto",
        "[[data-collapsible=icon][data-motion-phase=idle]_&]:justify-center [[data-collapsible=icon][data-motion-phase=idle]_&]:gap-0",
        "[[data-collapsible=icon][data-motion-phase=idle]_&]:pl-0",
      )}
    >
      <Skeleton className="size-5 shrink-0 rounded-md" />
      <Skeleton className={cn("h-4", props.textWidthClassName, NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)} />
    </div>
  );
}

export function AdminSidebarHeaderSkeleton() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full min-w-0",
        "flex items-center gap-2",
        "[[data-collapsible=icon][data-motion-phase=idle]_&]:flex-col [[data-collapsible=icon][data-motion-phase=idle]_&]:items-center [[data-collapsible=icon][data-motion-phase=idle]_&]:gap-1",
      )}
    >
      <Skeleton
        className={cn(
          "h-10 min-w-0 flex-1 rounded-lg",
          "[[data-collapsible=icon][data-motion-phase=idle]_&]:w-10 [[data-collapsible=icon][data-motion-phase=idle]_&]:flex-none",
        )}
      />
      <Skeleton
        className={cn(
          "h-10 w-10 rounded-lg",
          "[[data-collapsible=icon][data-motion-phase=idle]_&]:w-10",
        )}
      />
    </div>
  );
}

export function AdminSidebarAccountSkeleton() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-16 w-full",
        "flex items-center justify-start gap-3 px-5",
        "[[data-collapsible=icon][data-motion-phase=idle]_&]:justify-center [[data-collapsible=icon][data-motion-phase=idle]_&]:px-0",
        "animate-pulse",
      )}
    >
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3 w-32 rounded" />
        <Skeleton className="h-2.5 w-40 rounded opacity-80" />
      </div>
    </div>
  );
}

export function AdminSidebarMainMenuSkeleton() {
  return (
    <nav aria-hidden="true" className="mt-4 mb-8">
      <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:gap-2">
        <SidebarNavRowSkeleton textWidthClassName="w-28" />
        <SidebarNavRowSkeleton textWidthClassName="w-36" />
        <SidebarNavRowSkeleton textWidthClassName="w-24" />
        <SidebarNavRowSkeleton textWidthClassName="w-40" />
        <SidebarNavRowSkeleton textWidthClassName="w-32" />
        <SidebarNavRowSkeleton textWidthClassName="w-20" />
        <SidebarNavRowSkeleton textWidthClassName="w-36" />
      </div>
    </nav>
  );
}

export function AdminSidebarFooterMenuSkeleton() {
  return (
    <nav aria-hidden="true" className="mt-0 mb-0">
      <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:gap-2">
        <SidebarNavRowSkeleton textWidthClassName="w-28" />
        <SidebarNavRowSkeleton textWidthClassName="w-24" />
      </div>
    </nav>
  );
}
