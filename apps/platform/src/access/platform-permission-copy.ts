import type { TFunction } from "i18next";

type PermissionCopyToken = Readonly<{ action: string; resource: string }>;

const PERMISSION_COPY = {
  "platform:access-team:read": { action: "VIEW", resource: "PLATFORM_TEAM" },
  "platform:access-team:invite": { action: "INVITE", resource: "PLATFORM_TEAM" },
  "platform:access-team:remove": { action: "REMOVE", resource: "PLATFORM_TEAM_MEMBERS" },
  "platform:access-roles:read": { action: "VIEW", resource: "ROLES" },
  "platform:access-roles:manage": { action: "MANAGE", resource: "ROLES" },
  "platform:access-mfa:reset": { action: "RESET", resource: "OPERATOR_MFA" },
  "platform:access-sessions:read": { action: "VIEW", resource: "OPERATOR_SESSIONS" },
  "platform:access-sessions:revoke": { action: "REVOKE", resource: "OPERATOR_SESSIONS" },
  "platform:access-sign-in-settings:read": { action: "VIEW", resource: "SIGN_IN_SETTINGS" },
  "platform:access-sign-in-settings:manage": { action: "MANAGE", resource: "SIGN_IN_SETTINGS" },
  "platform:monitoring-requests:read": { action: "VIEW", resource: "REQUEST_MONITORING" },
  "platform:monitoring-audit:read": { action: "VIEW", resource: "AUDIT_LOG" },
  "platform:operations-signals:read": { action: "VIEW", resource: "OPERATIONAL_SIGNALS" },
  "platform:operations-signals:claim": { action: "CLAIM", resource: "OPERATIONAL_SIGNALS" },
  "platform:operations-signals:assign": { action: "ASSIGN", resource: "OPERATIONAL_SIGNALS" },
  "platform:operations-signals:triage": { action: "TRIAGE", resource: "OPERATIONAL_SIGNALS" },
  "platform:tenant-users:read": { action: "VIEW", resource: "TENANT_USERS" },
  "platform:tenant-users:manage": { action: "MANAGE", resource: "TENANT_USERS" },
  "platform:tenant-workspaces:read": { action: "VIEW", resource: "TENANT_WORKSPACES" },
  "platform:tenant-workspaces:manage": { action: "MANAGE", resource: "TENANT_WORKSPACES" },
  "platform:tenant-projects:read": { action: "VIEW", resource: "TENANT_PROJECTS" },
  "platform:tenant-projects:manage": { action: "MANAGE", resource: "TENANT_PROJECTS" },
  "platform:tenant-support:read": { action: "VIEW", resource: "SUPPORT_CASES" },
  "platform:commerce:read": { action: "VIEW", resource: "COMMERCE_OPERATIONS" },
  "platform:commerce:catalog-manage": { action: "MANAGE", resource: "PLAN_CATALOG" },
  "platform:commerce:subscriptions-manage": { action: "MANAGE", resource: "SUBSCRIPTIONS" },
  "platform:commerce:credits-adjust": { action: "ADJUST", resource: "CREDITS" },
  "platform:commerce:provider-manage": { action: "MANAGE", resource: "COMMERCE_PROVIDER" },
  "platform:commerce:events-reconcile": { action: "RECONCILE", resource: "PROVIDER_EVENTS" },
  "platform:ai-providers:read": { action: "VIEW", resource: "AI_PROVIDERS" },
  "platform:ai-providers:manage": { action: "MANAGE", resource: "AI_PROVIDERS" },
  "platform:ai-agents:read": { action: "VIEW", resource: "AI_AGENTS" },
  "platform:ai-agents:manage": { action: "MANAGE", resource: "AI_AGENTS" },
  "platform:ai-skills:read": { action: "VIEW", resource: "AI_SKILLS" },
  "platform:ai-skills:manage": { action: "MANAGE", resource: "AI_SKILLS" },
  "platform:ai-assignments:read": { action: "VIEW", resource: "AI_ASSIGNMENTS" },
  "platform:ai-assignments:manage": { action: "MANAGE", resource: "AI_ASSIGNMENTS" },
  "platform:ai-runtime-settings:read": { action: "VIEW", resource: "AI_RUNTIME_SETTINGS" },
  "platform:ai-runtime-settings:manage": { action: "MANAGE", resource: "AI_RUNTIME_SETTINGS" },
  "platform:ai-tasks:read": { action: "VIEW", resource: "AI_TASKS" },
  "platform:ai-tasks:recover": { action: "RECOVER", resource: "AI_TASKS" },
  "platform:site-delivery:read": { action: "VIEW", resource: "SITE_DELIVERY" },
  "platform:site-delivery:manage": { action: "MANAGE", resource: "SITE_DELIVERY" },
  "platform:site-storage:read": { action: "VIEW", resource: "SITE_STORAGE" },
  "platform:site-storage:manage": { action: "MANAGE", resource: "SITE_STORAGE" },
  "platform:site-delivery-settings:read": { action: "VIEW", resource: "DELIVERY_SETTINGS" },
  "platform:site-delivery-settings:manage": { action: "MANAGE", resource: "DELIVERY_SETTINGS" },
  "platform:messages-feedback:read": { action: "VIEW", resource: "FEEDBACK" },
  "platform:messages-feedback:manage": { action: "MANAGE", resource: "FEEDBACK" },
  "platform:messages-mail:read": { action: "VIEW", resource: "MAIL" },
  "platform:messages-mail:manage": { action: "MANAGE", resource: "MAIL" },
  "platform:messages-campaigns:read": { action: "VIEW", resource: "CAMPAIGNS" },
  "platform:messages-campaigns:manage": { action: "MANAGE", resource: "CAMPAIGNS" },
  "platform:messages-campaigns:send": { action: "SEND", resource: "CAMPAIGNS" },
  "platform:messages-delivery:retry": { action: "RETRY", resource: "MESSAGE_DELIVERY" },
  "platform:messages-delivery-settings:read": {
    action: "VIEW",
    resource: "MESSAGE_DELIVERY_SETTINGS",
  },
  "platform:messages-delivery-settings:manage": {
    action: "MANAGE",
    resource: "MESSAGE_DELIVERY_SETTINGS",
  },
  "platform:extensions-catalog:read": { action: "VIEW", resource: "EXTENSION_CATALOG" },
  "platform:extensions:install": { action: "INSTALL", resource: "EXTENSIONS" },
  "platform:extensions:configure": { action: "CONFIGURE", resource: "EXTENSIONS" },
  "platform:jobs:read": { action: "VIEW", resource: "BACKGROUND_JOBS" },
  "platform:jobs:manage": { action: "MANAGE", resource: "BACKGROUND_JOBS" },
  "platform:workspace-capability-rollout:apply": {
    action: "APPLY",
    resource: "CAPABILITY_ROLLOUT",
  },
} satisfies Readonly<Record<string, PermissionCopyToken>>;

const DOMAIN_KEYS = {
  access: "ACCESS",
  ai: "AI",
  capabilities: "CAPABILITIES",
  commerce: "COMMERCE",
  extensions: "EXTENSIONS",
  jobs: "JOBS",
  messages: "MESSAGES",
  monitoring: "MONITORING",
  operations: "OPERATIONS",
  "site-delivery": "SITE_DELIVERY",
  "tenant-governance": "TENANT_GOVERNANCE",
} satisfies Readonly<Record<string, string>>;

export function localizePlatformPermission(code: string, t: TFunction<"access">) {
  const copy = PERMISSION_COPY[code as keyof typeof PERMISSION_COPY];
  if (!copy) throw new Error(`Unknown Platform permission copy: ${code}`);
  const action = t(`PERMISSION_ACTION_${copy.action}`);
  const resource = t(`PERMISSION_RESOURCE_${copy.resource}`);
  return {
    description: t("PERMISSION_COPY_DESCRIPTION", { action, resource }),
    name: t("PERMISSION_COPY_NAME", { action, resource }),
  };
}

export function localizePlatformPermissionDomain(domain: string, t: TFunction<"access">) {
  const key = DOMAIN_KEYS[domain as keyof typeof DOMAIN_KEYS];
  if (!key) throw new Error(`Unknown Platform permission domain: ${domain}`);
  return t(`PERMISSION_DOMAIN_${key}`);
}
