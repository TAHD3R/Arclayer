import { Fragment, useMemo } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityAccessProvider } from "@/capabilities/capability-access";
import {
  resolveCapabilityBreadcrumbTrail,
  type CapabilityBreadcrumbCrumb,
} from "@/capabilities/navigation-projection";
import { usePlatformCapabilityCatalog } from "@/capabilities/use-capability-catalog";
import { PlatformCommandCenter } from "@/command-center/platform-command-center";
import { PlatformSidebar } from "@/components/platform-sidebar";
import {
  resolveCapabilityState,
  type ResolvedCapabilityState,
} from "@/components/platform-shell-state";
import { RouteTransition } from "@/components/route-transition";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";

function PlatformHeader(props: { state: ResolvedCapabilityState; pathname: string }) {
  const { t } = useTranslation(["common", "navigation"]);
  const navigate = useNavigate();
  const trail =
    props.state.status === "success"
      ? resolveCapabilityBreadcrumbTrail(props.pathname, props.state.projection)
      : null;
  const fallbackKey =
    props.state.status === "loading"
      ? "navigation:CAPABILITY_LOADING"
      : props.state.status === "error"
        ? "navigation:CAPABILITY_ERROR_TITLE"
        : "navigation:CAPABILITY_UNAUTHORIZED";
  // A domain and its primary destination can share a label (Workspaces);
  // collapse duplicated neighbours instead of repeating the same words.
  const crumbs = useMemo(() => {
    if (!trail) return [] as Array<CapabilityBreadcrumbCrumb & { label: string }>;
    return trail
      .map((crumb) => ({ ...crumb, label: t(crumb.labelKey) }))
      .filter((crumb, index, all) => crumb.label !== all[index - 1]?.label);
  }, [t, trail]);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
        <SidebarTrigger aria-label={t("common:SIDEBAR_TOGGLE")} className="-ml-1" />
        <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList>
            {crumbs.length > 0 ? (
              crumbs.map((crumb, index) => (
                <Fragment key={crumb.labelKey}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {crumb.linkPath && index < crumbs.length - 1 ? (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.linkPath}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage aria-current="page">{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>{t(fallbackKey)}</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {props.state.status === "success" ? (
        <div className="flex items-center pr-4">
          <PlatformCommandCenter
            destinations={props.state.projection.destinations}
            isCatalogPartial={props.state.projection.isPartial}
            onNavigate={(path) => void navigate({ to: path })}
            pathname={props.pathname}
          />
        </div>
      ) : null}
    </header>
  );
}

function PlatformContent(props: { state: ResolvedCapabilityState; pathname: string }) {
  const { t } = useTranslation("navigation");

  if (props.state.status === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0" role="status">
        <p className="text-sm text-muted-foreground">{t("CAPABILITY_LOADING")}</p>
        <Skeleton className="h-24 w-full max-w-2xl rounded-xl" />
      </div>
    );
  }
  if (props.state.status === "error") {
    return (
      <div className="flex flex-1 flex-col p-4 pt-0">
        <Alert className="max-w-2xl" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("CAPABILITY_ERROR_TITLE")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{t("CAPABILITY_ERROR_DESCRIPTION")}</p>
            <p className="text-sm text-muted-foreground" data-testid="capability-error-code">
              {t("CAPABILITY_ERROR_CODE", { code: props.state.errorCode })}
            </p>
            <p className="text-sm text-muted-foreground" data-testid="capability-error-message">
              {props.state.errorMessage}
            </p>
            <Button onClick={props.state.retry} size="sm" variant="outline">
              {t("CAPABILITY_RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!resolveCapabilityBreadcrumbTrail(props.pathname, props.state.projection)) {
    return (
      <div className="flex flex-1 flex-col p-4 pt-0">
        <Alert className="max-w-2xl" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("CAPABILITY_UNAUTHORIZED")}</AlertTitle>
        </Alert>
      </div>
    );
  }

  return (
    <CapabilityAccessProvider capabilities={props.state.capabilities}>
      <RouteTransition>
        <Outlet />
      </RouteTransition>
    </CapabilityAccessProvider>
  );
}

export function PlatformShell() {
  const catalogState = usePlatformCapabilityCatalog();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const state = useMemo(() => resolveCapabilityState(catalogState), [catalogState]);

  return (
    <SidebarProvider defaultOpen>
      <PlatformSidebar pathname={pathname} state={state} />
      <SidebarInset className="h-svh min-h-0 w-auto min-w-0 flex-1 overflow-hidden">
        <PlatformHeader pathname={pathname} state={state} />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <PlatformContent pathname={pathname} state={state} />
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
