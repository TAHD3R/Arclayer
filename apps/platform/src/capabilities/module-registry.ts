import {
  Activity,
  BadgeDollarSign,
  Bot,
  BookOpenCheck,
  BrainCircuit,
  Building2,
  ChartNoAxesCombined,
  CircleAlert,
  CreditCard,
  FileSearch,
  Files,
  Globe2,
  HardDrive,
  History,
  KeyRound,
  LayoutDashboard,
  Mail,
  MessageSquare,
  PlugZap,
  Puzzle,
  ReceiptText,
  ScrollText,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCog,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type TrustedCapabilityRouteTarget =
  | "access.team"
  | "tenants.workspaces"
  | "ai.tasks"
  | "site-delivery.issues"
  | "communications.feedback"
  | "extensions.installed"
  | "commerce.subscriptions"
  | "monitoring.requests";

export type TrustedSupportingRouteTarget = "operations.jobs";

export type TrustedNavigationRouteTarget =
  | TrustedCapabilityRouteTarget
  | "access.roles"
  | "access.sign-in"
  | "tenants.users"
  | "tenants.projects"
  | "ai.providers"
  | "ai.assistants"
  | "ai.skills"
  | "ai.policies"
  | "site-delivery.domains"
  | "site-delivery.storage"
  | "site-delivery.policies"
  | "communications.deliveries"
  | "communications.campaigns"
  | "communications.templates"
  | "communications.email"
  | "extensions.catalog"
  | "extensions.connections"
  | "extensions.history"
  | "commerce.plans"
  | "commerce.payments"
  | "commerce.credits"
  | "commerce.configuration"
  | "monitoring.performance"
  | "monitoring.ai-usage"
  | "monitoring.activity"
  | "monitoring.audit"
  | "monitoring.jobs";

export type PlatformDestinationId =
  | "overview"
  | "needs-attention"
  | "access-team"
  | "access-roles"
  | "access-sign-in"
  | "workspace-workspaces"
  | "workspace-users"
  | "workspace-projects"
  | "ai-tasks"
  | "ai-providers"
  | "ai-assistants"
  | "ai-skills"
  | "ai-policies"
  | "hosting-issues"
  | "hosting-domains"
  | "hosting-storage"
  | "hosting-policies"
  | "messages-feedback"
  | "messages-deliveries"
  | "messages-campaigns"
  | "messages-templates"
  | "messages-email"
  | "extensions-installed"
  | "extensions-catalog"
  | "extensions-connections"
  | "extensions-history"
  | "billing-subscriptions"
  | "billing-plans"
  | "billing-payments"
  | "billing-credits"
  | "billing-configuration"
  | "monitoring-requests"
  | "monitoring-performance"
  | "monitoring-ai-usage"
  | "monitoring-activity"
  | "monitoring-audit"
  | "monitoring-jobs";

export type PlatformDestination = Readonly<{
  id: PlatformDestinationId;
  path:
    | "/"
    | "/attention"
    | "/access/team"
    | "/access/roles"
    | "/access/sign-in"
    | "/workspaces"
    | "/users"
    | "/projects"
    | "/ai/tasks"
    | "/ai/providers"
    | "/ai/assistants"
    | "/ai/skills"
    | "/ai/policies"
    | "/hosting/issues"
    | "/hosting/domains"
    | "/hosting/storage"
    | "/hosting/policies"
    | "/messages/feedback"
    | "/messages/deliveries"
    | "/messages/campaigns"
    | "/messages/templates"
    | "/messages/email"
    | "/extensions/installed"
    | "/extensions/catalog"
    | "/extensions/connections"
    | "/extensions/history"
    | "/billing/subscriptions"
    | "/billing/plans"
    | "/billing/payments"
    | "/billing/credits"
    | "/billing/configuration"
    | "/monitoring/requests"
    | "/monitoring/performance"
    | "/monitoring/ai-usage"
    | "/monitoring/activity"
    | "/monitoring/audit"
    | "/monitoring/jobs";
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

export type PlatformSupportingRouteDestination = Readonly<{
  routeTarget: TrustedSupportingRouteTarget;
  path: "/attention/$signalId";
  labelKey: string;
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

const PLATFORM_SUPPORTING_ROUTE_DESTINATIONS: Readonly<
  Record<TrustedSupportingRouteTarget, PlatformSupportingRouteDestination>
> = {
  "operations.jobs": {
    routeTarget: "operations.jobs",
    path: "/attention/$signalId",
    labelKey: "inbox:BACKGROUND_JOB_DESTINATION",
  },
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
        icon: UserRoundCog,
      },
      {
        id: "access-sign-in",
        routeTarget: "access.sign-in",
        path: "/access/sign-in",
        labelKey: "navigation:ACCESS_SIGN_IN",
        icon: KeyRound,
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
      {
        id: "workspace-users",
        routeTarget: "tenants.users",
        path: "/users",
        labelKey: "navigation:WORKSPACE_USERS",
        icon: UsersRound,
      },
      {
        id: "workspace-projects",
        routeTarget: "tenants.projects",
        path: "/projects",
        labelKey: "navigation:WORKSPACE_PROJECTS",
        icon: Files,
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
        icon: BrainCircuit,
      },
      {
        id: "ai-assistants",
        routeTarget: "ai.assistants",
        path: "/ai/assistants",
        labelKey: "navigation:AI_ASSISTANTS",
        icon: UsersRound,
      },
      {
        id: "ai-skills",
        routeTarget: "ai.skills",
        path: "/ai/skills",
        labelKey: "navigation:AI_SKILLS",
        icon: BookOpenCheck,
      },
      {
        id: "ai-policies",
        routeTarget: "ai.policies",
        path: "/ai/policies",
        labelKey: "navigation:AI_POLICIES",
        icon: SlidersHorizontal,
      },
    ],
  },
  "site-delivery.issues": {
    routeTarget: "site-delivery.issues",
    domainLabelKey: "navigation:HOSTING_DOMAINS",
    destinations: [
      {
        id: "hosting-issues",
        routeTarget: "site-delivery.issues",
        path: "/hosting/issues",
        labelKey: "navigation:HOSTING_ISSUES",
        icon: FileSearch,
      },
      {
        id: "hosting-domains",
        routeTarget: "site-delivery.domains",
        path: "/hosting/domains",
        labelKey: "navigation:HOSTING_DOMAINS_LIST",
        icon: Globe2,
      },
      {
        id: "hosting-storage",
        routeTarget: "site-delivery.storage",
        path: "/hosting/storage",
        labelKey: "navigation:HOSTING_STORAGE",
        icon: HardDrive,
      },
      {
        id: "hosting-policies",
        routeTarget: "site-delivery.policies",
        path: "/hosting/policies",
        labelKey: "navigation:HOSTING_POLICIES",
        icon: SlidersHorizontal,
      },
    ],
  },
  "communications.feedback": {
    routeTarget: "communications.feedback",
    domainLabelKey: "navigation:COMMUNICATIONS",
    destinations: [
      {
        id: "messages-feedback",
        routeTarget: "communications.feedback",
        path: "/messages/feedback",
        labelKey: "navigation:MESSAGES_FEEDBACK",
        icon: MessageSquare,
      },
      {
        id: "messages-deliveries",
        routeTarget: "communications.deliveries",
        path: "/messages/deliveries",
        labelKey: "navigation:MESSAGES_DELIVERIES",
        icon: Send,
      },
      {
        id: "messages-campaigns",
        routeTarget: "communications.campaigns",
        path: "/messages/campaigns",
        labelKey: "navigation:MESSAGES_CAMPAIGNS",
        icon: Files,
      },
      {
        id: "messages-templates",
        routeTarget: "communications.templates",
        path: "/messages/templates",
        labelKey: "navigation:MESSAGES_TEMPLATES",
        icon: ReceiptText,
      },
      {
        id: "messages-email",
        routeTarget: "communications.email",
        path: "/messages/email",
        labelKey: "navigation:MESSAGES_EMAIL",
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
        icon: Puzzle,
      },
      {
        id: "extensions-catalog",
        routeTarget: "extensions.catalog",
        path: "/extensions/catalog",
        labelKey: "navigation:EXTENSIONS_CATALOG",
        icon: Files,
      },
      {
        id: "extensions-connections",
        routeTarget: "extensions.connections",
        path: "/extensions/connections",
        labelKey: "navigation:EXTENSIONS_CONNECTIONS",
        icon: PlugZap,
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
  "commerce.subscriptions": {
    routeTarget: "commerce.subscriptions",
    domainLabelKey: "navigation:PLANS_BILLING",
    destinations: [
      {
        id: "billing-subscriptions",
        routeTarget: "commerce.subscriptions",
        path: "/billing/subscriptions",
        labelKey: "navigation:BILLING_SUBSCRIPTIONS",
        icon: ReceiptText,
      },
      {
        id: "billing-plans",
        routeTarget: "commerce.plans",
        path: "/billing/plans",
        labelKey: "navigation:BILLING_PLANS",
        icon: BadgeDollarSign,
      },
      {
        id: "billing-payments",
        routeTarget: "commerce.payments",
        path: "/billing/payments",
        labelKey: "navigation:BILLING_PAYMENTS",
        icon: CreditCard,
      },
      {
        id: "billing-credits",
        routeTarget: "commerce.credits",
        path: "/billing/credits",
        labelKey: "navigation:BILLING_CREDITS",
        icon: BadgeDollarSign,
      },
      {
        id: "billing-configuration",
        routeTarget: "commerce.configuration",
        path: "/billing/configuration",
        labelKey: "navigation:BILLING_CONFIGURATION",
        icon: Settings2,
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
      {
        id: "monitoring-jobs",
        routeTarget: "monitoring.jobs",
        path: "/monitoring/jobs",
        labelKey: "navigation:MONITORING_JOBS",
        icon: Workflow,
      },
    ],
  },
};

// Canonical domain order from docs/spec/shared/product-admin-experience-redesign.md §4.1:
// Workspaces, AI Services, Hosting & Domains, Messages & Feedback, Extensions,
// Plans & Billing, Access & Security, Monitoring & Audit. Enabled and authorized
// domains render in this order regardless of backend catalog record order.
export const PLATFORM_CAPABILITY_DOMAIN_ORDER: readonly TrustedCapabilityRouteTarget[] = [
  "tenants.workspaces",
  "ai.tasks",
  "site-delivery.issues",
  "communications.feedback",
  "extensions.installed",
  "commerce.subscriptions",
  "access.team",
  "monitoring.requests",
];

export function getTrustedCapabilityModule(routeTarget: string): PlatformCapabilityModule | null {
  if (!(routeTarget in PLATFORM_CAPABILITY_MODULES)) return null;
  return PLATFORM_CAPABILITY_MODULES[routeTarget as TrustedCapabilityRouteTarget];
}

// True for any route the build knows as a capability destination, authorized or
// not. Projection uses it to keep an unauthorized destination path rejected
// instead of falling through to the domain-prefix route authority below.
export function isRegisteredCapabilityDestinationPath(pathname: string): boolean {
  return Object.values(PLATFORM_CAPABILITY_MODULES).some((module) =>
    module.destinations.some(
      (destination) => pathname === destination.path || pathname.startsWith(`${destination.path}/`),
    ),
  );
}

export function getTrustedSupportingRouteDestination(
  routeTarget: string,
): PlatformSupportingRouteDestination | null {
  if (!(routeTarget in PLATFORM_SUPPORTING_ROUTE_DESTINATIONS)) return null;
  return PLATFORM_SUPPORTING_ROUTE_DESTINATIONS[routeTarget as TrustedSupportingRouteTarget];
}
