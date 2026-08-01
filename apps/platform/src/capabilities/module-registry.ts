import {
  Activity,
  Bot,
  Building2,
  ChartNoAxesCombined,
  CircleAlert,
  FileSearch,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type TrustedCapabilityRouteTarget =
  | "access.team"
  | "tenants.workspaces"
  | "monitoring.requests";

export type TrustedNavigationRouteTarget =
  | TrustedCapabilityRouteTarget
  | "monitoring.performance"
  | "monitoring.ai-usage"
  | "monitoring.activity"
  | "monitoring.audit";

export type PlatformDestinationId =
  | "overview"
  | "needs-attention"
  | "access-team"
  | "workspace-workspaces"
  | "monitoring-requests"
  | "monitoring-performance"
  | "monitoring-ai-usage"
  | "monitoring-activity"
  | "monitoring-audit";

export type PlatformDestination = Readonly<{
  id: PlatformDestinationId;
  path:
    | "/"
    | "/attention"
    | "/access/team"
    | "/workspaces"
    | "/monitoring/requests"
    | "/monitoring/performance"
    | "/monitoring/ai-usage"
    | "/monitoring/activity"
    | "/monitoring/audit";
  labelKey: string;
  icon: LucideIcon;
}>;

export type PlatformCapabilityDestination = PlatformDestination &
  Readonly<{ routeTarget: TrustedNavigationRouteTarget }>;

export type PlatformCapabilityModule = Readonly<{
  routeTarget: TrustedCapabilityRouteTarget;
  domainLabelKey: string;
  destinations: readonly PlatformCapabilityDestination[];
}>;

export const OVERVIEW_DESTINATION: PlatformDestination = {
  id: "overview",
  path: "/",
  labelKey: "navigation:OVERVIEW",
  icon: LayoutDashboard,
};

export const NEEDS_ATTENTION_DESTINATION: PlatformDestination = {
  id: "needs-attention",
  path: "/attention",
  labelKey: "navigation:NEEDS_ATTENTION",
  icon: CircleAlert,
};

export const PLATFORM_CAPABILITY_MODULES: Readonly<
  Record<TrustedCapabilityRouteTarget, PlatformCapabilityModule>
> = {
  "access.team": {
    routeTarget: "access.team",
    domainLabelKey: "navigation:ACCESS_SECURITY",
    destinations: [
      {
        id: "access-team",
        routeTarget: "access.team",
        path: "/access/team",
        labelKey: "navigation:ACCESS_TEAM",
        icon: ShieldCheck,
      },
    ],
  },
  "tenants.workspaces": {
    routeTarget: "tenants.workspaces",
    domainLabelKey: "navigation:WORKSPACES",
    destinations: [
      {
        id: "workspace-workspaces",
        routeTarget: "tenants.workspaces",
        path: "/workspaces",
        labelKey: "navigation:WORKSPACES_DIRECTORY",
        icon: Building2,
      },
    ],
  },
  "monitoring.requests": {
    routeTarget: "monitoring.requests",
    domainLabelKey: "navigation:MONITORING_AUDIT",
    destinations: [
      {
        id: "monitoring-requests",
        routeTarget: "monitoring.requests",
        path: "/monitoring/requests",
        labelKey: "navigation:MONITORING_REQUESTS",
        icon: FileSearch,
      },
      {
        id: "monitoring-performance",
        routeTarget: "monitoring.performance",
        path: "/monitoring/performance",
        labelKey: "navigation:MONITORING_PERFORMANCE",
        icon: ChartNoAxesCombined,
      },
      {
        id: "monitoring-ai-usage",
        routeTarget: "monitoring.ai-usage",
        path: "/monitoring/ai-usage",
        labelKey: "navigation:MONITORING_AI_USAGE",
        icon: Bot,
      },
      {
        id: "monitoring-activity",
        routeTarget: "monitoring.activity",
        path: "/monitoring/activity",
        labelKey: "navigation:MONITORING_ACTIVITY",
        icon: Activity,
      },
      {
        id: "monitoring-audit",
        routeTarget: "monitoring.audit",
        path: "/monitoring/audit",
        labelKey: "navigation:MONITORING_AUDIT_TRAIL",
        icon: ScrollText,
      },
    ],
  },
};

export function getTrustedCapabilityModule(routeTarget: string): PlatformCapabilityModule | null {
  if (!(routeTarget in PLATFORM_CAPABILITY_MODULES)) return null;
  return PLATFORM_CAPABILITY_MODULES[routeTarget as TrustedCapabilityRouteTarget];
}
