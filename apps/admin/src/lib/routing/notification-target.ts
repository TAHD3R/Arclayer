import type { NotificationItem } from "@/types/api";

export function resolveNotificationTarget(item: NotificationItem): string | null {
  const workspaceId = String(item.workspaceId || "").trim();
  const targetTo = String(item.targetTo || "").trim();
  if (!workspaceId || !targetTo) return null;

  if (targetTo === "/") return `/w/${workspaceId}/`;
  if (targetTo.startsWith("/w/") || targetTo.startsWith("/o/")) return targetTo;

  return `/w/${workspaceId}${targetTo.startsWith("/") ? targetTo : `/${targetTo}`}`;
}
