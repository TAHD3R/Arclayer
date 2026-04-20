import type { NotificationItem } from "@/types/api";
import type { SettingsSectionTarget } from "@/lib/settings/settings-screen";

export type NotificationTarget =
  | Readonly<{ type: "navigate"; to: string }>
  | Readonly<{ type: "settings"; target: SettingsSectionTarget }>;

function navigateTarget(to: string): NotificationTarget {
  return { type: "navigate", to };
}

function settingsTarget(target: SettingsSectionTarget): NotificationTarget {
  return { type: "settings", target };
}

function resolveLegacyOrganizationTarget(
  targetTo: string,
  workspaceId: string,
): NotificationTarget {
  if (/^\/o\/[^/]+\/workspaces\/?$/.test(targetTo)) return navigateTarget("/projects");
  if (/^\/o\/[^/]+\/billing\/?$/.test(targetTo))
    return settingsTarget({ screen: "personal.profile" });
  if (/^\/o\/[^/]+\/usage\/?$/.test(targetTo))
    return settingsTarget({ screen: "personal.profile" });
  if (/^\/o\/[^/]+\/settings\/danger\/?$/.test(targetTo))
    return settingsTarget({ screen: "personal.profile", section: "danger" });
  if (/^\/o\/[^/]+\/team\/members\/?$/.test(targetTo))
    return settingsTarget({ screen: "workspace.members", section: "members-table" });
  if (/^\/o\/[^/]+\/team\/invitations\/?$/.test(targetTo))
    return settingsTarget({ screen: "workspace.invitations", section: "pending-invitations" });
  if (/^\/o\/[^/]+\/team\/roles\/?$/.test(targetTo))
    return settingsTarget({ screen: "workspace.roles", section: "roles-table" });
  if (/^\/o\/[^/]+\/extensions(?:\/|$)/.test(targetTo))
    return navigateTarget(`/projects/${workspaceId}/settings/general`);
  if (/^\/o\/[^/]+\/(?:activity|settings\/activity)\/?$/.test(targetTo)) {
    return navigateTarget(`/projects/${workspaceId}/activity`);
  }
  return navigateTarget("/projects");
}

function resolveWorkspaceSettingsTarget(targetTo: string): NotificationTarget | null {
  const normalized = targetTo.replace(/\/+$/, "");
  if (normalized === "/settings/workspace/general") {
    return settingsTarget({ screen: "workspace.general" });
  }
  if (normalized === "/settings/workspace/members") {
    return settingsTarget({ screen: "workspace.members", section: "members-table" });
  }
  if (normalized === "/settings/workspace/invitations") {
    return settingsTarget({ screen: "workspace.invitations", section: "pending-invitations" });
  }
  if (normalized === "/settings/workspace/roles") {
    return settingsTarget({ screen: "workspace.roles", section: "roles-table" });
  }
  return null;
}

export function resolveNotificationTarget(item: NotificationItem): NotificationTarget | null {
  const workspaceId = String(item.workspaceId || "").trim();
  const targetTo = String(item.targetTo || "").trim();
  if (!workspaceId || !targetTo) return null;

  if (targetTo === "/") return navigateTarget(`/projects/${workspaceId}/`);
  if (targetTo.startsWith("/projects/")) return navigateTarget(targetTo);
  if (targetTo.startsWith("/settings/workspace/")) return resolveWorkspaceSettingsTarget(targetTo);
  if (targetTo.startsWith("/w/")) {
    const projectPath = targetTo.replace(`/w/${workspaceId}`, `/projects/${workspaceId}`);
    if (projectPath === `/projects/${workspaceId}/team/members`) {
      return settingsTarget({ screen: "workspace.members", section: "members-table" });
    }
    if (projectPath === `/projects/${workspaceId}/team/invitations`) {
      return settingsTarget({ screen: "workspace.invitations", section: "pending-invitations" });
    }
    if (projectPath === `/projects/${workspaceId}/team/roles`) {
      return settingsTarget({ screen: "workspace.roles", section: "roles-table" });
    }
    if (projectPath === `/projects/${workspaceId}/settings/workspace`) {
      return settingsTarget({ screen: "workspace.general" });
    }
    return navigateTarget(
      projectPath
        .replace(
          `/projects/${workspaceId}/settings/site/basics`,
          `/projects/${workspaceId}/settings/general`,
        )
        .replace(
          `/projects/${workspaceId}/settings/site/localization`,
          `/projects/${workspaceId}/settings/localization`,
        )
        .replace(
          `/projects/${workspaceId}/settings/site`,
          `/projects/${workspaceId}/settings/general`,
        )
        .replace(`/projects/${workspaceId}/settings/seo`, `/projects/${workspaceId}/settings/seo`),
    );
  }
  if (targetTo.startsWith("/o/")) return resolveLegacyOrganizationTarget(targetTo, workspaceId);

  return navigateTarget(
    `/projects/${workspaceId}${targetTo.startsWith("/") ? targetTo : `/${targetTo}`}`,
  );
}
