import * as React from "react";

import {
  UserIdentityInline,
  getUserIdentityPrimaryLabel,
  getUserIdentitySecondaryLabel,
} from "@/pages/_shared/team/components/user-identity";

export type ActivityUserSummary = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export function renderUserDisplayName(user: ActivityUserSummary | null | undefined): string {
  return getUserIdentityPrimaryLabel(user);
}

export function ActivityUserPill(props: {
  user: ActivityUserSummary | null | undefined;
  secondary?: React.ReactNode;
  size?: number;
}) {
  const size = props.size ?? 24;
  const user = props.user;
  const fallbackSecondary = getUserIdentitySecondaryLabel(user);
  const inlineSecondary = props.secondary ?? fallbackSecondary;
  const cardDescription =
    typeof props.secondary === "string" &&
    fallbackSecondary &&
    fallbackSecondary !== props.secondary
      ? fallbackSecondary
      : null;

  return (
    <UserIdentityInline
      user={user ?? null}
      avatarSize={size}
      className="min-w-0"
      inlineSecondary={inlineSecondary}
      cardDescription={cardDescription}
      triggerClassName="gap-2"
      primaryClassName="truncate text-footnote font-medium"
      secondaryClassName="truncate text-caption text-label-secondary"
    />
  );
}
