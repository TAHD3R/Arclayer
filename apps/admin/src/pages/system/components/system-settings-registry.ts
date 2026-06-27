import type { LucideIcon } from "lucide-react";
import { Bell, Bot, HardDrive, KeyRound, Mail, UserRoundPlus } from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";

export type SystemSettingsPageKey =
  | "access"
  | "agents"
  | "storage"
  | "email"
  | "notifications"
  | "oauth";

export type SystemSettingsItemId =
  | "oauth-provisioning"
  | "public-registration"
  | "agent-effective-posture"
  | "agent-usage-governance"
  | "agent-runtime"
  | "agent-modes-skills"
  | "agent-write-approvals"
  | "agent-langgraph"
  | "default-profile"
  | "profiles"
  | "create-profile"
  | "upload-limits"
  | "email-delivery"
  | "active-provider"
  | "active-provider-config"
  | "sender-identity"
  | "delivery-policy"
  | "test-email"
  | "notification-policy"
  | "notification-email-templates"
  | "google"
  | "github"
  | "microsoft"
  | "discord";

export type SystemSettingsSearchItem = {
  id: SystemSettingsItemId;
  page: SystemSettingsPageKey;
  titleKey: string;
  descriptionKey: string;
  keywords?: readonly string[];
};

export type SystemSettingsPageMeta = {
  key: SystemSettingsPageKey;
  labelKey: string;
  titleKey: string;
  descriptionKey: string;
  to: `/system/settings/${SystemSettingsPageKey}`;
  icon: LucideIcon;
};

export const SYSTEM_SETTINGS_PAGES: readonly SystemSettingsPageMeta[] = [
  {
    key: "access",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_ACCESS",
    titleKey: "settings:SETTINGS_SYSTEM_ACCESS_PAGE_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_ACCESS_PAGE_DESC",
    to: "/system/settings/access",
    icon: UserRoundPlus,
  },
  {
    key: "agents",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_AGENTS",
    titleKey: "settings:SETTINGS_SYSTEM_AGENTS_PAGE_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_AGENTS_PAGE_DESC",
    to: "/system/settings/agents",
    icon: Bot,
  },
  {
    key: "storage",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_STORAGE",
    titleKey: "settings:SETTINGS_SYSTEM_STORAGE_PAGE_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_PAGE_DESC",
    to: "/system/settings/storage",
    icon: HardDrive,
  },
  {
    key: "email",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_EMAIL",
    titleKey: "settings:SETTINGS_SYSTEM_EMAIL_PAGE_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_EMAIL_PAGE_DESC",
    to: "/system/settings/email",
    icon: Mail,
  },
  {
    key: "notifications",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_NOTIFICATIONS",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_PAGE_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_PAGE_DESC",
    to: "/system/settings/notifications",
    icon: Bell,
  },
  {
    key: "oauth",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_OAUTH",
    titleKey: "settings:SETTINGS_SYSTEM_OAUTH_PAGE_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_OAUTH_PAGE_DESC",
    to: "/system/settings/oauth",
    icon: KeyRound,
  },
] as const;

export const SYSTEM_SETTINGS_ITEMS: readonly SystemSettingsSearchItem[] = [
  {
    id: "oauth-provisioning",
    page: "access",
    titleKey: "settings:SETTINGS_SYSTEM_ACCESS_PROVISIONING_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_ACCESS_PROVISIONING_DESC",
    keywords: ["oauth", "provisioning", "invites"],
  },
  {
    id: "public-registration",
    page: "access",
    titleKey: "settings:SETTINGS_SYSTEM_ACCESS_REGISTRATION_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_ACCESS_REGISTRATION_DESC",
    keywords: ["registration", "sign up", "allowlist"],
  },
  {
    id: "agent-effective-posture",
    page: "agents",
    titleKey: "settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_DESC",
    keywords: ["ai", "agent", "effective", "posture", "summary", "status"],
  },
  {
    id: "agent-usage-governance",
    page: "agents",
    titleKey: "settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_DESC",
    keywords: ["ai", "usage", "billing", "provider", "model", "budget"],
  },
  {
    id: "agent-runtime",
    page: "agents",
    titleKey: "settings:SETTINGS_SYSTEM_AGENTS_RUNTIME_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_AGENTS_RUNTIME_DESC",
    keywords: ["ai", "agent", "model", "reasoning"],
  },
  {
    id: "agent-modes-skills",
    page: "agents",
    titleKey: "settings:SETTINGS_SYSTEM_AGENTS_MODES_SKILLS_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_AGENTS_MODES_SKILLS_DESC",
    keywords: ["build", "plan", "agent", "skills"],
  },
  {
    id: "agent-write-approvals",
    page: "agents",
    titleKey: "settings:SETTINGS_SYSTEM_AGENTS_APPROVALS_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_AGENTS_APPROVALS_DESC",
    keywords: ["approval", "dry run", "write tools"],
  },
  {
    id: "agent-langgraph",
    page: "agents",
    titleKey: "settings:SETTINGS_SYSTEM_AGENTS_LANGGRAPH_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_AGENTS_LANGGRAPH_DESC",
    keywords: ["langgraph", "checkpoint", "interrupt", "resume"],
  },
  {
    id: "default-profile",
    page: "storage",
    titleKey: "settings:SETTINGS_SYSTEM_STORAGE_DEFAULT_LABEL",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_DEFAULT_DESC",
    keywords: ["storage", "default"],
  },
  {
    id: "profiles",
    page: "storage",
    titleKey: "settings:SETTINGS_SYSTEM_STORAGE_PROFILES_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_PROFILES_DESC",
    keywords: ["storage", "profiles", "provider"],
  },
  {
    id: "create-profile",
    page: "storage",
    titleKey: "settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_CREATE_DESC",
    keywords: ["storage", "create", "provider"],
  },
  {
    id: "upload-limits",
    page: "storage",
    titleKey: "settings:SETTINGS_SYSTEM_STORAGE_UPLOAD_LIMITS_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_STORAGE_UPLOAD_LIMITS_DESC",
    keywords: ["upload", "limits", "recycle"],
  },
  {
    id: "email-delivery",
    page: "email",
    titleKey: "settings:SETTINGS_MESSAGING_MAIL_ENABLED_TITLE",
    descriptionKey: "settings:SETTINGS_MESSAGING_MAIL_ENABLED_DESC",
    keywords: ["mail", "enabled"],
  },
  {
    id: "active-provider",
    page: "email",
    titleKey: "settings:SETTINGS_MESSAGING_MAIL_PROVIDER_TITLE",
    descriptionKey: "settings:SETTINGS_MESSAGING_MAIL_PROVIDER_DESC",
    keywords: ["smtp", "resend", "cloudflare", "ses"],
  },
  {
    id: "active-provider-config",
    page: "email",
    titleKey: "settings:SETTINGS_SYSTEM_EMAIL_ACTIVE_PROVIDER_CONFIG_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_EMAIL_ACTIVE_PROVIDER_CONFIG_DESC",
    keywords: ["provider", "configuration"],
  },
  {
    id: "sender-identity",
    page: "email",
    titleKey: "settings:SETTINGS_SYSTEM_EMAIL_SENDER_IDENTITY_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_EMAIL_SENDER_IDENTITY_DESC",
    keywords: ["from", "sender"],
  },
  {
    id: "delivery-policy",
    page: "email",
    titleKey: "settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_TITLE",
    descriptionKey: "settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_DESC",
    keywords: ["retry", "fallback"],
  },
  {
    id: "test-email",
    page: "email",
    titleKey: "settings:SETTINGS_MESSAGING_MAIL_TEST_TITLE",
    descriptionKey: "settings:SETTINGS_MESSAGING_MAIL_TEST_DESC",
    keywords: ["test", "mail"],
  },
  {
    id: "notification-policy",
    page: "notifications",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_DESC",
    keywords: ["invite", "notification"],
  },
  {
    id: "notification-email-templates",
    page: "notifications",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_DESC",
    keywords: ["email", "templates"],
  },
  {
    id: "google",
    page: "oauth",
    titleKey: "settings:SETTINGS_SYSTEM_OAUTH_GOOGLE_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_DIALOG_DESC",
    keywords: ["google", "oauth"],
  },
  {
    id: "github",
    page: "oauth",
    titleKey: "settings:SETTINGS_SYSTEM_OAUTH_GITHUB_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_DIALOG_DESC",
    keywords: ["github", "oauth"],
  },
  {
    id: "microsoft",
    page: "oauth",
    titleKey: "settings:SETTINGS_SYSTEM_OAUTH_MICROSOFT_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_DIALOG_DESC",
    keywords: ["microsoft", "oauth"],
  },
  {
    id: "discord",
    page: "oauth",
    titleKey: "settings:SETTINGS_SYSTEM_OAUTH_DISCORD_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_DIALOG_DESC",
    keywords: ["discord", "oauth"],
  },
] as const;

export function buildSystemSettingsNavItems(): AdminNavItem[] {
  return SYSTEM_SETTINGS_PAGES.map((page) => ({
    key: `system.settings.${page.key}`,
    label: page.key,
    labelKey: page.labelKey,
    to: page.to,
    icon: page.icon,
  }));
}

export function getSystemSettingsPage(pathname: string): SystemSettingsPageMeta {
  return (
    SYSTEM_SETTINGS_PAGES.find((page) => pathname.startsWith(page.to)) ?? SYSTEM_SETTINGS_PAGES[0]
  );
}

export function getSystemSettingsItem(
  page: SystemSettingsPageKey,
  id: string,
): SystemSettingsSearchItem | null {
  return SYSTEM_SETTINGS_ITEMS.find((item) => item.page === page && item.id === id) ?? null;
}
