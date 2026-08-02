import type { NotificationOut as NotificationItem } from "@arclayer/openapi";
import type { SettingsSectionTarget } from "@/lib/settings/settings-screen";

export type NotificationTarget =
  | Readonly<{ type: "navigate"; to: string }>
  | Readonly<{ type: "settings"; target: SettingsSectionTarget }>
  | Readonly<{ type: "feedback"; ticketId: string }>;

export type NotificationNavigationTarget = NotificationItem["target"];

const GLOBAL_NOTIFICATION_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

export function canAccessNotificationNavigationTarget(input: {
  notificationWorkspaceId: string;
  currentWorkspaceId: string | null;
  target: NotificationNavigationTarget;
  accessibleWorkspaceIds: ReadonlySet<string>;
  accessibleProjectIds: ReadonlySet<string>;
}): boolean {
  if (input.target.kind === "project") {
    return input.accessibleProjectIds.has(input.target.projectId);
  }
  if (input.target.kind !== "workspace_settings") return true;
  const workspaceId =
    input.notificationWorkspaceId === GLOBAL_NOTIFICATION_WORKSPACE_ID
      ? input.currentWorkspaceId
      : input.notificationWorkspaceId;
  return workspaceId !== null && input.accessibleWorkspaceIds.has(workspaceId);
}

function navigateTarget(to: string): NotificationTarget {
  return { type: "navigate", to };
}

function settingsTarget(target: SettingsSectionTarget): NotificationTarget {
  return { type: "settings", target };
}

function resolveWorkspaceSettingsTarget(
  target: Extract<NotificationNavigationTarget, { kind: "workspace_settings" }>,
): NotificationTarget {
  if (target.destination === "general") {
    return settingsTarget({ screen: "workspace.general" });
  }
  if (target.destination === "plan_usage") {
    return settingsTarget({ screen: "workspace.plan-usage" });
  }
  if (target.destination === "people") {
    if (target.section !== "members-table" && target.section !== "pending-invitations") {
      throw new Error("NOTIFICATION_WORKSPACE_PEOPLE_SECTION_INVALID");
    }
    return settingsTarget({ screen: "workspace.people", section: target.section });
  }
  if (target.section !== "roles-table") {
    throw new Error("NOTIFICATION_WORKSPACE_ROLES_SECTION_INVALID");
  }
  return settingsTarget({ screen: "workspace.roles", section: target.section });
}

function resolveProjectTarget(
  target: Extract<NotificationNavigationTarget, { kind: "project" }>,
): NotificationTarget {
  const projectPath = `/projects/${encodeURIComponent(target.projectId)}`;
  if (target.destination === "overview") {
    return navigateTarget(`${projectPath}/`);
  }
  if (target.destination === "settings_api") {
    return navigateTarget(`${projectPath}/settings/api`);
  }
  if (target.destination === "website_releases") {
    return navigateTarget(`${projectPath}/website/project-releases`);
  }
  const libraryPath = `${projectPath}/content/library`;
  return navigateTarget(
    target.entityId ? `${libraryPath}/${encodeURIComponent(target.entityId)}` : libraryPath,
  );
}

export function resolveNotificationNavigationTarget(
  target: NotificationNavigationTarget,
): NotificationTarget {
  if (target.kind === "inbox") return navigateTarget("/notifications");
  if (target.kind === "workspace_settings") return resolveWorkspaceSettingsTarget(target);
  if (target.kind === "project") return resolveProjectTarget(target);
  return { type: "feedback", ticketId: target.ticketId };
}

export function resolveNotificationTarget(item: NotificationItem): NotificationTarget {
  return resolveNotificationNavigationTarget(item.target);
}
