import * as React from "react";

import { InvitationRoleTag, InvitationStatusTag, UsesCountTag } from "@/components/ui/tags";

import { UserIdentityMetaList, type UserIdentityMetaItem } from "./user-identity-meta";
import { UserLabel, type UserLabelProps, type UserLabelUser } from "./user-label";

type InvitationUserStatus = "pending" | "accepted" | "revoked" | "expired";

export type InvitationUserLabelProps = Omit<
  UserLabelProps,
  "user" | "cardDescription" | "cardBadges"
> & {
  user: UserLabelUser | null;
  roleLabel?: string | null;
  status?: InvitationUserStatus | null;
  statusLabel?: string | null;
  usesCount?: number | null;
  details?: UserIdentityMetaItem[];
  extraBadges?: React.ReactNode;
};

export function InvitationUserLabel(props: InvitationUserLabelProps) {
  const badges = [
    props.roleLabel ? <InvitationRoleTag key="role" label={props.roleLabel} /> : null,
    props.status && props.statusLabel ? (
      <InvitationStatusTag key="status" status={props.status} label={props.statusLabel} />
    ) : null,
    typeof props.usesCount === "number" ? (
      <UsesCountTag key="uses" label={props.usesCount} />
    ) : null,
    props.extraBadges,
  ];

  return (
    <UserLabel
      user={props.user}
      avatarSize={props.avatarSize}
      triggerSecondary={props.triggerSecondary}
      cardSecondary={props.cardSecondary}
      className={props.className}
      triggerClassName={props.triggerClassName}
      primaryClassName={props.primaryClassName}
      secondaryClassName={props.secondaryClassName}
      infoClassName={props.infoClassName}
      cardClassName={props.cardClassName}
      cardDescription={
        props.details?.length ? <UserIdentityMetaList items={props.details} /> : undefined
      }
      cardBadges={badges}
    />
  );
}
