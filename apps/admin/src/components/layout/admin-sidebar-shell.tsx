import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "antd";

import type { AdminNavItem } from "@/types/admin-nav";
import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import { OrgContextPanel } from "@/components/layout/org-context-panel";
import { LightRays } from "@celestial/ui/light-rays";
import { Illust404BrokenLink } from "@celestial/ui/illustrations";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuSkeleton,
} from "@celestial/ui/sidebar";
import { cn } from "@celestial/lib/utils";

const LIGHT_RAYS_COUNT = 7;
const LIGHT_RAYS_SPEED = 16;
const LIGHT_RAYS_BLUR = 48;
const LIGHT_RAYS_LENGTH = "70vh";
const LIGHT_RAYS_COLOR = "rgba(140, 200, 255, 0.18)";

export type AdminSidebarShellProps = {
  showNavSkeleton: boolean;
  showOrgNavErrorOverlay: boolean;
  mainItems: readonly AdminNavItem[];
  footerItems: readonly AdminNavItem[];
  resolvePermissionName?: (code: string) => string | null;
  onRetryOrgNav: () => void;
  className?: string;
};

export function AdminSidebarShell({
  showNavSkeleton,
  showOrgNavErrorOverlay,
  mainItems,
  footerItems,
  resolvePermissionName,
  onRetryOrgNav,
  className,
}: AdminSidebarShellProps) {
  const { t } = useTranslation();

  return (
    <Sidebar
      collapsible="icon"
      animateOnHover={false}
      className={cn("relative isolate z-40", className)}
      style={
        {
          "--ant-color-link": "var(--color-muted-foreground)",
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-90 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      >
        <LightRays
          count={LIGHT_RAYS_COUNT}
          speed={LIGHT_RAYS_SPEED}
          blur={LIGHT_RAYS_BLUR}
          length={LIGHT_RAYS_LENGTH}
          color={LIGHT_RAYS_COLOR}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent"
        />
      </div>

      <SidebarHeader
        className={cn("relative z-10 flex w-full h-16", "items-center gap-2", "px-2.5 py-0")}
      >
        <OrgContextPanel className={cn("min-w-0 flex-1")} />
      </SidebarHeader>

      <SidebarContent className="relative z-10 mx-2 overflow-hidden scrollbar-none">
        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col overflow-auto scrollbar-none">
            {showNavSkeleton ? (
              <div className="mt-4 mb-8">
                <div className="px-3.5 py-2">
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                </div>
              </div>
            ) : (
              <AdminSiderNav items={mainItems} resolvePermissionName={resolvePermissionName} />
            )}
          </div>

          {showOrgNavErrorOverlay ? (
            <div className="absolute inset-0 z-20 flex items-start justify-center p-3">
              <div className="absolute inset-0 bg-sidebar/70 supports-[backdrop-filter]:bg-sidebar/50 backdrop-blur-md" />
              <div className="relative w-full max-w-[280px]">
                <div className="rounded-xl border border-border/60 bg-background/70 supports-[backdrop-filter]:bg-background/55 backdrop-blur-md shadow-sm">
                  <div className="px-4 pt-4 pb-3 text-center">
                    <Illust404BrokenLink className="mx-auto max-w-[160px]" />
                    <div className="mt-2 text-title text-label-primary">
                      {t("common:REQUEST_FAILED")}
                    </div>
                    <div className="mt-1 text-footnote text-label-secondary">
                      {t("common:PAGE_SERVER_ERROR_DESC")}
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <Button
                        size="small"
                        type="primary"
                        onClick={onRetryOrgNav}
                        autoInsertSpace={false}
                      >
                        {t("common:RETRY")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {footerItems.length > 0 ? (
          <div className="shrink-0 flex flex-col pb-2">
            <AdminSiderNav
              items={footerItems}
              resolvePermissionName={resolvePermissionName}
              className="mt-0 mb-0"
            />
          </div>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="relative z-10 isolate border-t border-border px-0">
        <AdminAccountMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
