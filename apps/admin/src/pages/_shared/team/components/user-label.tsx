import * as React from "react";

import { UserIdentityInline, type UserIdentity } from "./user-identity";

export type UserLabelUser = Pick<
  UserIdentity,
  "username" | "email" | "displayName" | "avatarUrl" | "userId" | "id"
>;

export type UserLabelProps = {
  user: UserLabelUser | null;
  avatarSize?: number;
  triggerSecondary?: React.ReactNode;
  cardSecondary?: React.ReactNode;
  cardDescription?: React.ReactNode;
  cardBadges?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
  infoClassName?: string;
  cardClassName?: string;
};

export function UserLabel(props: UserLabelProps) {
  return (
    <UserIdentityInline
      user={props.user}
      avatarSize={props.avatarSize ?? 24}
      triggerSecondary={props.triggerSecondary}
      cardSecondary={props.cardSecondary}
      cardDescription={props.cardDescription}
      cardBadges={props.cardBadges}
      className={props.className ?? "min-w-0"}
      triggerClassName={props.triggerClassName ?? "gap-2"}
      primaryClassName={props.primaryClassName ?? "truncate text-footnote font-medium"}
      secondaryClassName={props.secondaryClassName ?? "truncate text-caption text-label-secondary"}
      infoClassName={props.infoClassName}
      cardClassName={props.cardClassName}
    />
  );
}

// 兼容旧实现：table columns 常用 render 函数签名。
export function renderUserLabel(
  user: UserLabelUser | null,
  options?: Omit<UserLabelProps, "user">,
): React.ReactNode {
  return <UserLabel user={user} {...options} />;
}
