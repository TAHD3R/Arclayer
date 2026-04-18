import type { NotificationItem } from "@/types/api";

function resolveLegacyOrganizationTarget(targetTo: string, workspaceId: string): string {
  if (/^\/o\/[^/]+\/workspaces\/?$/.test(targetTo)) return "/projects";
  if (/^\/o\/[^/]+\/billing\/?$/.test(targetTo)) return "/settings/personal/profile";
  if (/^\/o\/[^/]+\/usage\/?$/.test(targetTo)) return "/settings/personal/profile";
  if (/^\/o\/[^/]+\/settings\/danger\/?$/.test(targetTo)) return "/settings/personal/profile";
  if (/^\/o\/[^/]+\/team\/members\/?$/.test(targetTo)) return "/settings/workspace/members";
  if (/^\/o\/[^/]+\/team\/invitations\/?$/.test(targetTo)) return "/settings/workspace/invitations";
  if (/^\/o\/[^/]+\/team\/roles\/?$/.test(targetTo)) return "/settings/workspace/roles";
  if (/^\/o\/[^/]+\/extensions(?:\/|$)/.test(targetTo))
    return `/projects/${workspaceId}/extensions`;
  if (/^\/o\/[^/]+\/(?:activity|settings\/activity)\/?$/.test(targetTo)) {
    return `/projects/${workspaceId}/activity`;
  }
  return "/projects";
}

export function resolveNotificationTarget(item: NotificationItem): string | null {
  const workspaceId = String(item.workspaceId || "").trim();
  const targetTo = String(item.targetTo || "").trim();
  if (!workspaceId || !targetTo) return null;

  if (targetTo === "/") return `/projects/${workspaceId}/`;
  if (targetTo.startsWith("/projects/")) return targetTo;
  if (targetTo.startsWith("/settings/workspace/")) return targetTo;
  if (targetTo.startsWith("/w/")) {
    const projectPath = targetTo.replace(`/w/${workspaceId}`, `/projects/${workspaceId}`);
    return projectPath
      .replace(`/projects/${workspaceId}/team/members`, "/settings/workspace/members")
      .replace(`/projects/${workspaceId}/team/invitations`, "/settings/workspace/invitations")
      .replace(`/projects/${workspaceId}/team/roles`, "/settings/workspace/roles")
      .replace(`/projects/${workspaceId}/settings/workspace`, "/settings/workspace/general")
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
      .replace(`/projects/${workspaceId}/settings/seo`, `/projects/${workspaceId}/settings/seo`);
  }
  if (targetTo.startsWith("/o/")) return resolveLegacyOrganizationTarget(targetTo, workspaceId);

  return `/projects/${workspaceId}${targetTo.startsWith("/") ? targetTo : `/${targetTo}`}`;
}
