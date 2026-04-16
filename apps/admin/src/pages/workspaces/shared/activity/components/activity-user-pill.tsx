import * as React from "react";

import {
  UserIdentityInline,
  getUserIdentityPrimaryLabel,
} from "@/pages/workspaces/team/shared/components/user-identity";

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
  const referenceText =
    typeof props.secondary === "string" || typeof props.secondary === "number"
      ? String(props.secondary).trim()
      : "";

  return (
    <UserIdentityInline
      user={user ?? null}
      avatarSize={size}
      className="min-w-0"
      triggerSecondary={referenceText || null}
      triggerClassName="gap-2"
      primaryClassName="truncate text-footnote font-medium"
      secondaryClassName="truncate text-caption text-label-secondary"
    />
  );
}
