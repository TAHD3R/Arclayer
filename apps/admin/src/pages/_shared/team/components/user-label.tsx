import * as React from "react";

import { UserIdentityInline, type UserIdentity } from "./user-identity";

export type UserLabelUser = Pick<
  UserIdentity,
  "username" | "email" | "displayName" | "avatarUrl" | "userId" | "id"
>;

export function UserLabel(props: { user: UserLabelUser | null }) {
  return (
    <UserIdentityInline
      user={props.user}
      avatarSize={24}
      className="min-w-0"
      triggerClassName="gap-2"
      primaryClassName="truncate text-footnote font-medium"
      secondaryClassName="truncate text-caption text-label-secondary"
    />
  );
}

// 兼容旧实现：table columns 常用 render 函数签名。
export function renderUserLabel(user: UserLabelUser | null): React.ReactNode {
  return <UserLabel user={user} />;
}
