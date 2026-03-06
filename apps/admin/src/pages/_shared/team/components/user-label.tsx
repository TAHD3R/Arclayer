import * as React from "react";

import { UserAvatar } from "@/components/common/entity-avatar";

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
      <UserAvatar name={primary} assetRef={user.avatarUrl} size={24} className="shrink-0" />
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
