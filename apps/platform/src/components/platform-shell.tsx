import { useMemo } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertCircle, Hexagon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { PlatformDestination } from "@/capabilities/module-registry";
import {
  projectCapabilityNavigation,
  resolveCapabilityBreadcrumbKey,
  type CapabilityNavigationProjection,
} from "@/capabilities/navigation-projection";
import {
  usePlatformCapabilityCatalog,
  type PlatformCapabilityCatalogState,
} from "@/capabilities/use-capability-catalog";
import {
  LocaleMenu,
  ProductApplicationLink,
  SignOutButton,
  ThemeMenu,
} from "@/components/platform-utilities";
import { RouteTransition } from "@/components/route-transition";
import { PlatformCommandCenter } from "@/command-center/platform-command-center";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@arclayer/ui/breadcrumb";
import { Button } from "@arclayer/ui/button";
import { Separator } from "@arclayer/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@arclayer/ui/sidebar";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

type ResolvedCapabilityState =
  | Readonly<{ status: "loading"; retry: () => void }>
  | Readonly<{ status: "error"; retry: () => void }>
  | Readonly<{
      status: "success";
      projection: CapabilityNavigationProjection;
      retry: () => void;
    }>;

function Brand() {
  const { t } = useTranslation("common");
  return (
    <div className="flex h-12 items-center gap-3 px-2 group-data-[collapsible=icon]:justify-center">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Hexagon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 text-callout font-semibold group-data-[collapsible=icon]:hidden">
        {t("APP_NAME")}
      </span>
    </div>
  );
}

function DestinationNavigation(props: { destination: PlatformDestination; isActive: boolean }) {
  const { t } = useTranslation("navigation");
  const { isMobile, setOpenMobile, state } = useSidebar();
  const label = t(props.destination.labelKey);
  const Icon = props.destination.icon;
  const item = (
    <SidebarMenuButton asChild isActive={props.isActive} tooltip={undefined}>
      <Link to={props.destination.path} onClick={() => setOpenMobile(false)}>
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
  );

  if (isMobile || state !== "collapsed") return item;
  return (
    <Tooltip side="right">
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent role="tooltip">{label}</TooltipContent>
    </Tooltip>
  );
}

function CapabilityNavigation(props: {
  projection: CapabilityNavigationProjection;
  pathname: string;
}) {
  const { t } = useTranslation("navigation");
  const inbox = props.projection.destinations[0];
  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <DestinationNavigation destination={inbox} isActive={props.pathname === inbox.path} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {props.projection.capabilityItems.map((item) => (
        <SidebarGroup key={item.capabilityId}>
          <SidebarGroupContent>
            <p className="px-2 pb-1 text-caption font-semibold text-label-secondary">
              {t(item.module.domainLabelKey)}
            </p>
            <SidebarMenu>
              {item.destinations.map((destination) => (
                <SidebarMenuItem key={destination.id}>
                  <DestinationNavigation
                    destination={destination}
                    isActive={props.pathname === destination.path}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
      {props.projection.isPartial ? (
        <p
          className="px-4 py-3 text-footnote text-label-secondary group-data-[collapsible=icon]:hidden"
          role="status"
        >
          {t("CAPABILITY_PARTIAL")}
        </p>
      ) : null}
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
        <span className="text-footnote text-label-secondary">{t("CAPABILITY_LOADING")}</span>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
      </div>
    );
  }
  return (
    <div className="space-y-3 px-4 py-3 group-data-[collapsible=icon]:hidden" role="alert">
      <p className="text-footnote font-medium">{t("CAPABILITY_ERROR_TITLE")}</p>
      <p className="text-footnote text-label-secondary">{t("CAPABILITY_ERROR_DESCRIPTION")}</p>
      <Button onClick={props.state.retry} size="sm" variant="outline">
        {t("CAPABILITY_RETRY")}
      </Button>
    </div>
  );
}

function PlatformNavigation(props: { state: ResolvedCapabilityState; pathname: string }) {
  const { t } = useTranslation("common");
  return (
    <Sidebar collapsible="icon" animateOnHover={false}>
      <SidebarHeader>
        <Brand />
      </SidebarHeader>
      <SidebarContent>
        {props.state.status === "success" ? (
          <CapabilityNavigation pathname={props.pathname} projection={props.state.projection} />
        ) : (
          <CapabilityNavigationState state={props.state} />
        )}
      </SidebarContent>
      <SidebarRail aria-label={t("SIDEBAR_TOGGLE")} />
    </Sidebar>
  );
}

function PlatformHeader(props: { state: ResolvedCapabilityState; pathname: string }) {
  const { t } = useTranslation(["common", "navigation"]);
  const navigate = useNavigate();
  const titleKey =
    props.state.status === "success"
      ? resolveCapabilityBreadcrumbKey(props.pathname, props.state.projection)
      : props.state.status === "loading"
        ? "navigation:CAPABILITY_LOADING"
        : "navigation:CAPABILITY_ERROR_TITLE";
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-header px-4 text-header-foreground">
      <SidebarTrigger aria-label={t("common:SIDEBAR_TOGGLE")} />
      <Separator className="h-5" orientation="vertical" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>
              {titleKey ? t(titleKey) : t("navigation:CAPABILITY_UNAUTHORIZED")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-1">
        {props.state.status === "success" ? (
          <PlatformCommandCenter
            destinations={props.state.projection.destinations}
            isCatalogPartial={props.state.projection.isPartial}
            onNavigate={(path) => void navigate({ to: path })}
            pathname={props.pathname}
          />
        ) : null}
        <ProductApplicationLink />
        <LocaleMenu />
        <ThemeMenu />
        <SignOutButton />
      </div>
    </header>
  );
}

function PlatformContent(props: { state: ResolvedCapabilityState; pathname: string }) {
  const { t } = useTranslation("navigation");
  if (props.state.status === "loading") {
    return (
      <main className="space-y-4 p-6" role="status">
        <p className="text-footnote text-label-secondary">{t("CAPABILITY_LOADING")}</p>
        <Skeleton className="h-24 w-full max-w-2xl" />
      </main>
    );
  }
  if (props.state.status === "error") {
    return (
      <main className="p-6">
        <Alert className="max-w-2xl" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("CAPABILITY_ERROR_TITLE")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{t("CAPABILITY_ERROR_DESCRIPTION")}</p>
            <Button onClick={props.state.retry} size="sm" variant="outline">
              {t("CAPABILITY_RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  if (!resolveCapabilityBreadcrumbKey(props.pathname, props.state.projection)) {
    return (
      <main className="p-6">
        <Alert className="max-w-2xl" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("CAPABILITY_UNAUTHORIZED")}</AlertTitle>
        </Alert>
      </main>
    );
  }
  return (
    <RouteTransition>
      <Outlet />
    </RouteTransition>
  );
}

function resolveCapabilityState(state: PlatformCapabilityCatalogState): ResolvedCapabilityState {
  if (state.status !== "success") return state;
  try {
    return {
      status: "success",
      projection: projectCapabilityNavigation(state.catalog.items),
      retry: state.retry,
    };
  } catch {
    return { status: "error", retry: state.retry };
  }
}

export function PlatformShell() {
  const catalogState = usePlatformCapabilityCatalog();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const state = useMemo(() => resolveCapabilityState(catalogState), [catalogState]);
  return (
    <SidebarProvider defaultOpen>
      <PlatformNavigation pathname={pathname} state={state} />
      <SidebarInset className="min-h-svh bg-background">
        <PlatformHeader pathname={pathname} state={state} />
        <PlatformContent pathname={pathname} state={state} />
      </SidebarInset>
    </SidebarProvider>
  );
}
