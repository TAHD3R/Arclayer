import {
  Activity,
  Bot,
  Building2,
  Cable,
  ChartNoAxesCombined,
  Database,
  FileSearch,
  FolderKanban,
  History,
  Globe2,
  Inbox,
  Mail,
  MessageSquare,
  PackageOpen,
  Puzzle,
  Send,
  ScrollText,
  Settings2,
  ShieldCheck,
  KeyRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type TrustedCapabilityRouteTarget =
  | "access.team"
  | "tenants.workspaces"
  | "monitoring.requests"
  | "commerce.subscriptions"
  | "ai.tasks"
  | "site-delivery.issues"
  | "communications.feedback"
  | "extensions.installed";

export type TrustedNavigationRouteTarget =
  | TrustedCapabilityRouteTarget
  | "access.roles"
  | "access.sessions"
  | "access.sign-in"
  | "tenants.users"
  | "tenants.projects"
  | "monitoring.performance"
  | "monitoring.ai-usage"
  | "monitoring.activity"
  | "monitoring.audit"
  | "commerce.subscriptions"
  | "commerce.plans"
  | "ai.tasks"
  | "ai.providers"
  | "ai.assistants"
  | "site-delivery.issues"
  | "site-delivery.domains"
  | "site-delivery.storage"
  | "site-delivery.rules"
  | "communications.feedback"
  | "communications.campaigns"
  | "communications.templates"
  | "communications.email"
  | "extensions.installed"
  | "extensions.catalog"
  | "extensions.connections"
  | "extensions.history";

export type PlatformDestinationId =
  | "operations-inbox"
  | "access-team"
  | "access-roles"
  | "access-sessions"
  | "access-sign-in"
  | "tenant-workspaces"
  | "tenant-users"
  | "tenant-projects"
  | "monitoring-requests"
  | "monitoring-performance"
  | "monitoring-ai-usage"
  | "monitoring-activity"
  | "monitoring-audit"
  | "commerce-subscriptions"
  | "commerce-plans"
  | "ai-tasks"
  | "ai-providers"
  | "ai-assistants"
  | "site-delivery-issues"
  | "site-delivery-domains"
  | "site-delivery-storage"
  | "site-delivery-rules"
  | "communications-feedback"
  | "communications-campaigns"
  | "communications-templates"
  | "communications-email"
  | "extensions-installed"
  | "extensions-catalog"
  | "extensions-connections"
  | "extensions-history";

export type PlatformDestination = Readonly<{
  id: PlatformDestinationId;
  path:
    | "/"
    | "/access/team"
    | "/access/roles"
    | "/access/sessions"
    | "/access/sign-in"
    | "/tenants/workspaces"
    | "/tenants/users"
    | "/tenants/projects"
    | "/monitoring/requests"
    | "/monitoring/performance"
    | "/monitoring/ai-usage"
    | "/monitoring/activity"
    | "/monitoring/audit"
    | "/commerce/subscriptions"
    | "/commerce/plans"
    | "/ai/tasks"
    | "/ai/providers"
    | "/ai/assistants"
    | "/site-delivery/issues"
    | "/site-delivery/domains"
    | "/site-delivery/storage"
    | "/site-delivery/rules"
    | "/communications/feedback"
    | "/communications/campaigns"
    | "/communications/templates"
    | "/communications/email"
    | "/extensions/installed"
    | "/extensions/catalog"
    | "/extensions/connections"
    | "/extensions/history";
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

export const OPERATIONS_INBOX_DESTINATION: PlatformDestination = {
  id: "operations-inbox",
  path: "/",
  labelKey: "navigation:OPERATIONS_INBOX",
  icon: Inbox,
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
      {
        id: "access-roles",
        routeTarget: "access.roles",
        path: "/access/roles",
        labelKey: "navigation:ACCESS_ROLES",
        icon: Users,
      },
      {
        id: "access-sessions",
        routeTarget: "access.sessions",
        path: "/access/sessions",
        labelKey: "navigation:ACCESS_SESSIONS",
        icon: KeyRound,
      },
      {
        id: "access-sign-in",
        routeTarget: "access.sign-in",
        path: "/access/sign-in",
        labelKey: "navigation:ACCESS_SIGN_IN",
        icon: ShieldCheck,
      },
    ],
  },
  "tenants.workspaces": {
    routeTarget: "tenants.workspaces",
    domainLabelKey: "navigation:TENANT_GOVERNANCE",
    destinations: [
      {
        id: "tenant-workspaces",
        routeTarget: "tenants.workspaces",
        path: "/tenants/workspaces",
        labelKey: "navigation:TENANT_WORKSPACES",
        icon: Building2,
      },
      {
        id: "tenant-users",
        routeTarget: "tenants.users",
        path: "/tenants/users",
        labelKey: "navigation:TENANT_USERS",
        icon: Users,
      },
      {
        id: "tenant-projects",
        routeTarget: "tenants.projects",
        path: "/tenants/projects",
        labelKey: "navigation:TENANT_PROJECTS",
        icon: FolderKanban,
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
  "commerce.subscriptions": {
    routeTarget: "commerce.subscriptions",
    domainLabelKey: "navigation:COMMERCE",
    destinations: [
      {
        id: "commerce-subscriptions",
        routeTarget: "commerce.subscriptions",
        path: "/commerce/subscriptions",
        labelKey: "navigation:COMMERCE_SUBSCRIPTIONS",
        icon: ScrollText,
      },
      {
        id: "commerce-plans",
        routeTarget: "commerce.plans",
        path: "/commerce/plans",
        labelKey: "navigation:COMMERCE_PLANS",
        icon: ChartNoAxesCombined,
      },
    ],
  },
  "ai.tasks": {
    routeTarget: "ai.tasks",
    domainLabelKey: "navigation:AI_SERVICES",
    destinations: [
      {
        id: "ai-tasks",
        routeTarget: "ai.tasks",
        path: "/ai/tasks",
        labelKey: "navigation:AI_TASKS",
        icon: Bot,
      },
      {
        id: "ai-providers",
        routeTarget: "ai.providers",
        path: "/ai/providers",
        labelKey: "navigation:AI_PROVIDERS",
        icon: Settings2,
      },
      {
        id: "ai-assistants",
        routeTarget: "ai.assistants",
        path: "/ai/assistants",
        labelKey: "navigation:AI_ASSISTANTS",
        icon: Bot,
      },
    ],
  },
  "site-delivery.issues": {
    routeTarget: "site-delivery.issues",
    domainLabelKey: "navigation:SITE_DELIVERY",
    destinations: [
      {
        id: "site-delivery-issues",
        routeTarget: "site-delivery.issues",
        path: "/site-delivery/issues",
        labelKey: "navigation:SITE_DELIVERY_ISSUES",
        icon: Inbox,
      },
      {
        id: "site-delivery-domains",
        routeTarget: "site-delivery.domains",
        path: "/site-delivery/domains",
        labelKey: "navigation:SITE_DELIVERY_DOMAINS",
        icon: Globe2,
      },
      {
        id: "site-delivery-storage",
        routeTarget: "site-delivery.storage",
        path: "/site-delivery/storage",
        labelKey: "navigation:SITE_DELIVERY_STORAGE",
        icon: Database,
      },
      {
        id: "site-delivery-rules",
        routeTarget: "site-delivery.rules",
        path: "/site-delivery/rules",
        labelKey: "navigation:SITE_DELIVERY_RULES",
        icon: Settings2,
      },
    ],
  },
  "communications.feedback": {
    routeTarget: "communications.feedback",
    domainLabelKey: "navigation:COMMUNICATIONS",
    destinations: [
      {
        id: "communications-feedback",
        routeTarget: "communications.feedback",
        path: "/communications/feedback",
        labelKey: "navigation:COMMUNICATIONS_FEEDBACK",
        icon: MessageSquare,
      },
      {
        id: "communications-campaigns",
        routeTarget: "communications.campaigns",
        path: "/communications/campaigns",
        labelKey: "navigation:COMMUNICATIONS_CAMPAIGNS",
        icon: Send,
      },
      {
        id: "communications-templates",
        routeTarget: "communications.templates",
        path: "/communications/templates",
        labelKey: "navigation:COMMUNICATIONS_TEMPLATES",
        icon: FileSearch,
      },
      {
        id: "communications-email",
        routeTarget: "communications.email",
        path: "/communications/email",
        labelKey: "navigation:COMMUNICATIONS_EMAIL",
        icon: Mail,
      },
    ],
  },
  "extensions.installed": {
    routeTarget: "extensions.installed",
    domainLabelKey: "navigation:EXTENSIONS",
    destinations: [
      {
        id: "extensions-installed",
        routeTarget: "extensions.installed",
        path: "/extensions/installed",
        labelKey: "navigation:EXTENSIONS_INSTALLED",
        icon: PackageOpen,
      },
      {
        id: "extensions-catalog",
        routeTarget: "extensions.catalog",
        path: "/extensions/catalog",
        labelKey: "navigation:EXTENSIONS_CATALOG",
        icon: Puzzle,
      },
      {
        id: "extensions-connections",
        routeTarget: "extensions.connections",
        path: "/extensions/connections",
        labelKey: "navigation:EXTENSIONS_CONNECTIONS",
        icon: Cable,
      },
      {
        id: "extensions-history",
        routeTarget: "extensions.history",
        path: "/extensions/history",
        labelKey: "navigation:EXTENSIONS_HISTORY",
        icon: History,
      },
    ],
  },
};

export function getTrustedCapabilityModule(routeTarget: string): PlatformCapabilityModule | null {
  if (!(routeTarget in PLATFORM_CAPABILITY_MODULES)) return null;
  return PLATFORM_CAPABILITY_MODULES[routeTarget as TrustedCapabilityRouteTarget];
}

export function requireTrustedNavigationDestination(
  routeTarget: TrustedNavigationRouteTarget,
): PlatformCapabilityDestination {
  for (const module of Object.values(PLATFORM_CAPABILITY_MODULES)) {
    const destination = module.destinations.find((item) => item.routeTarget === routeTarget);
    if (destination) return destination;
  }
  throw new Error(`Missing trusted Platform destination: ${routeTarget}`);
}
