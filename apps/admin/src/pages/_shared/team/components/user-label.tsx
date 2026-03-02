import { Avatar } from "antd";
import * as React from "react";

import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { initialsFromName } from "@/lib/auth/user-profile";

export type UserLabelUser = {
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export function UserLabel(props: { user: UserLabelUser | null }) {
  const user = props.user;
  if (!user) return <span className="text-label-secondary">-</span>;

  const primary = (user.displayName || user.username || user.email || "-").trim() || "-";
  const secondary = user.email || user.username || "";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar size={24} src={resolveAssetRefToPublicUrlPath(user.avatarUrl) || undefined}>
        {initialsFromName(primary)}
      </Avatar>
      <div className="min-w-0">
        <div className="text-footnote font-medium truncate">{primary}</div>
        {secondary ? (
          <div className="text-caption text-label-secondary truncate">{secondary}</div>
        ) : null}
      </div>
    </div>
  );
}

// 兼容旧实现：table columns 常用 render 函数签名。
export function renderUserLabel(user: UserLabelUser | null): React.ReactNode {
  return <UserLabel user={user} />;
}
