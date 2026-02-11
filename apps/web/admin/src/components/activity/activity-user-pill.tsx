import { Avatar } from "antd";
import * as React from "react";

import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";

export type ActivityUserSummary = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

function userInitials(label: string | null | undefined): string {
  const v = String(label || "U").trim();
  return v.slice(0, 1).toUpperCase();
}

export function renderUserDisplayName(user: ActivityUserSummary | null | undefined): string {
  if (!user) return "-";
  const primary = (user.displayName || user.username || user.id || "").trim();
  return primary || "-";
}

export function ActivityUserPill(props: {
  user: ActivityUserSummary | null | undefined;
  secondary?: React.ReactNode;
  size?: number;
}) {
  const size = props.size ?? 24;
  const user = props.user;
  if (!user) return <span className="text-muted-foreground">-</span>;

  const primary = renderUserDisplayName(user);
  const secondary = props.secondary;
  const avatarSrc = resolveAssetRefToPublicUrlPath(user.avatarUrl) || undefined;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar
        size={size}
        src={avatarSrc}
        style={{
          backgroundColor: "var(--color-muted)",
          color: "var(--color-foreground)",
          flexShrink: 0,
        }}
      >
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
