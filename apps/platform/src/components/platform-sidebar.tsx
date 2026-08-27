import { Link } from "@tanstack/react-router";
import { ChevronRight, Settings } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { PlatformDestination } from "@/capabilities/module-registry";
import type {
  CapabilityNavigationItem,
  CapabilityNavigationProjection,
} from "@/capabilities/navigation-projection";
import type { ResolvedCapabilityState } from "@/components/platform-shell-state";
import { PlatformUserMenu } from "@/components/platform-user-menu";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

function PlatformBrand() {
  const { t } = useTranslation("common");
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="lg" tooltip={t("APP_NAME")}>
          <Link aria-label={t("APP_NAME")} onClick={() => setOpenMobile(false)} to="/">
            <img
              alt=""
              aria-hidden="true"
              className="size-8 shrink-0 dark:invert"
              src="/logo.svg"
            />
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold">Arclayer</span>
              <span className="truncate text-xs">{t("ADMIN_CONSOLE")}</span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function isDestinationActive(pathname: string, destination: PlatformDestination): boolean {
  return pathname === destination.path || pathname.startsWith(`${destination.path}/`);
}

function DestinationNavigation(props: { destination: PlatformDestination; isActive: boolean }) {
  const { t } = useTranslation("navigation");
  const { setOpenMobile } = useSidebar();
  const label = t(props.destination.labelKey);
  const Icon = props.destination.icon;

  return (
    <SidebarMenuButton asChild isActive={props.isActive} tooltip={label}>
      <Link
        aria-current={props.isActive ? "page" : undefined}
        to={props.destination.path}
        onClick={() => setOpenMobile(false)}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

function CapabilityMenuItem(props: {
  item: CapabilityNavigationItem;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pathname: string;
}) {
  const { t } = useTranslation("navigation");
  const { setOpenMobile } = useSidebar();
  const active = props.item.destinations.some((destination) =>
    isDestinationActive(props.pathname, destination),
  );
  const defaultDestination = props.item.destinations[0];
  const label = t(props.item.module.domainLabelKey);
  const Icon = defaultDestination.icon;

  if (props.item.destinations.length === 1) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={label}>
          <Link
            aria-current={active ? "page" : undefined}
            to={defaultDestination.path}
            onClick={() => setOpenMobile(false)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible
      asChild
      className="group/collapsible"
      onOpenChange={props.onOpenChange}
      open={props.open}
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={active} tooltip={label}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <ChevronRight
              aria-hidden="true"
              className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {props.item.destinations.map((destination) => (
              <SidebarMenuSubItem key={destination.id}>
                <SidebarMenuSubButton
                  asChild
                  isActive={isDestinationActive(props.pathname, destination)}
                >
                  <Link
                    aria-current={
                      isDestinationActive(props.pathname, destination) ? "page" : undefined
                    }
                    to={destination.path}
                    onClick={() => setOpenMobile(false)}
                  >
                    <span>{t(destination.labelKey)}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function CapabilityNavigation(props: {
  projection: CapabilityNavigationProjection;
  pathname: string;
}) {
  const { t } = useTranslation("navigation");
  const { setOpenMobile } = useSidebar();
  const activeCapabilityId = props.projection.capabilityItems.find((item) =>
    item.destinations.some((destination) => isDestinationActive(props.pathname, destination)),
  )?.capabilityId;
  const [openCapabilityIds, setOpenCapabilityIds] = useState<ReadonlySet<string>>(
    () => new Set(activeCapabilityId ? [activeCapabilityId] : []),
  );

  // Only the active domain stays expanded; navigating collapses manually opened
  // domains so the tree keeps one predictable shape.
  useLayoutEffect(() => {
    setOpenCapabilityIds(new Set(activeCapabilityId ? [activeCapabilityId] : []));
  }, [activeCapabilityId]);

  const setCapabilityOpen = (capabilityId: string, open: boolean) => {
    setOpenCapabilityIds((current) => {
      if (open === current.has(capabilityId)) return current;
      const next = new Set(current);
      if (open) next.add(capabilityId);
      else next.delete(capabilityId);
      return next;
    });
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>{t("WORKBENCH")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {props.projection.primaryDestinations.map((destination) => (
              <SidebarMenuItem key={destination.id}>
                <DestinationNavigation
                  destination={destination}
                  isActive={isDestinationActive(props.pathname, destination)}
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {props.projection.capabilityItems.map((item) => (
              <CapabilityMenuItem
                item={item}
                key={item.capabilityId}
                onOpenChange={(open) => setCapabilityOpen(item.capabilityId, open)}
                open={openCapabilityIds.has(item.capabilityId)}
                pathname={props.pathname}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={props.pathname === "/settings"}
                tooltip={t("common:SYSTEM_SETTINGS_TITLE")}
              >
                <Link
                  aria-current={props.pathname === "/settings" ? "page" : undefined}
                  onClick={() => setOpenMobile(false)}
                  to="/settings"
                >
                  <Settings aria-hidden="true" />
                  <span>{t("common:SYSTEM_SETTINGS_TITLE")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

function CapabilityNavigationState(props: {
  state: Exclude<ResolvedCapabilityState, { status: "success" }>;
}) {
  const { t } = useTranslation("navigation");

  if (props.state.status === "loading") {
    return (
      <div className="space-y-3 px-4 py-3" role="status">
        <span className="text-sm text-muted-foreground">{t("CAPABILITY_LOADING")}</span>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 py-3 group-data-[collapsible=icon]:hidden" role="alert">
      <p className="text-sm font-medium">{t("CAPABILITY_ERROR_TITLE")}</p>
      <p className="text-sm text-muted-foreground">{t("CAPABILITY_ERROR_DESCRIPTION")}</p>
      <p className="text-sm text-muted-foreground" data-testid="capability-error-code">
        {t("CAPABILITY_ERROR_CODE", { code: props.state.errorCode })}
      </p>
      <p className="text-sm text-muted-foreground" data-testid="capability-error-message">
        {props.state.errorMessage}
      </p>
      <Button onClick={props.state.retry} size="sm" variant="outline">
        {t("CAPABILITY_RETRY")}
      </Button>
    </div>
  );
}

export function PlatformSidebar(props: { state: ResolvedCapabilityState; pathname: string }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <PlatformBrand />
      </SidebarHeader>
      <SidebarContent className="overscroll-contain">
        {props.state.status === "success" ? (
          <CapabilityNavigation pathname={props.pathname} projection={props.state.projection} />
        ) : (
          <CapabilityNavigationState state={props.state} />
        )}
      </SidebarContent>
      <SidebarFooter>
        <PlatformUserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
