import type { NotificationItem } from "@/types/api";

function resolveLegacyOrganizationTarget(targetTo: string, workspaceId: string): string {
  if (/^\/o\/[^/]+\/workspaces\/?$/.test(targetTo)) return "/account/workspaces";
  if (/^\/o\/[^/]+\/billing\/?$/.test(targetTo)) return "/account/billing";
  if (/^\/o\/[^/]+\/usage\/?$/.test(targetTo)) return "/account/usage";
  if (/^\/o\/[^/]+\/settings\/danger\/?$/.test(targetTo)) return "/account/danger";
  if (/^\/o\/[^/]+\/team\/members\/?$/.test(targetTo)) return `/w/${workspaceId}/team/members`;
  if (/^\/o\/[^/]+\/team\/invitations\/?$/.test(targetTo)) {
    return `/w/${workspaceId}/team/invitations`;
  }
  if (/^\/o\/[^/]+\/team\/roles\/?$/.test(targetTo)) return `/w/${workspaceId}/team/roles`;
  if (/^\/o\/[^/]+\/extensions(?:\/|$)/.test(targetTo)) return `/w/${workspaceId}/extensions`;
  if (/^\/o\/[^/]+\/(?:activity|settings\/activity)\/?$/.test(targetTo)) {
    return `/w/${workspaceId}/settings/maintenance/activity`;
  }
  return "/account/workspaces";
}

export function resolveNotificationTarget(item: NotificationItem): string | null {
  const workspaceId = String(item.workspaceId || "").trim();
  const targetTo = String(item.targetTo || "").trim();
  if (!workspaceId || !targetTo) return null;

  if (targetTo === "/") return `/w/${workspaceId}/`;
  if (targetTo.startsWith("/w/")) return targetTo;
  if (targetTo.startsWith("/o/")) return resolveLegacyOrganizationTarget(targetTo, workspaceId);

  return `/w/${workspaceId}${targetTo.startsWith("/") ? targetTo : `/${targetTo}`}`;
}
