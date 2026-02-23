import { Avatar } from "antd";
import * as React from "react";

import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";

export type TabKey = "pending" | "accepted" | "links";
export type RenewExpiresInSeconds = number | null;

function userInitials(label: string | null | undefined): string {
  const value = String(label || "U").trim();
  return value.slice(0, 1).toUpperCase();
}

export function renderUserLabel(
  user: {
    username: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null,
): React.ReactNode {
  if (!user) return <span className="text-muted-foreground">-</span>;

  const primary = (user.displayName || user.username || user.email || "-").trim() || "-";
  const secondary = user.email || user.username || "";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar size={24} src={resolveAssetRefToPublicUrlPath(user.avatarUrl) || undefined}>
        {userInitials(primary)}
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{primary}</div>
        {secondary ? (
          <div className="text-xs text-muted-foreground truncate">{secondary}</div>
        ) : null}
      </div>
    </div>
  );
}
