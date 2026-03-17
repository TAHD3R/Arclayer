import * as React from "react";
import { useTranslation } from "react-i18next";

import {
  UserIdentityInline,
  getUserIdentityPrimaryLabel,
  getUserIdentitySecondaryLabel,
} from "@/pages/_shared/team/components/user-identity";
import { UserIdentityMetaList } from "@/pages/_shared/team/components/user-identity-meta";

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
  const { t } = useTranslation(["activity"]);
  const size = props.size ?? 24;
  const user = props.user;
  const primary = getUserIdentityPrimaryLabel(user);
  const fallbackSecondary = getUserIdentitySecondaryLabel(user);
  const referenceText =
    typeof props.secondary === "string" || typeof props.secondary === "number"
      ? String(props.secondary).trim()
      : "";
  const cardDescription =
    referenceText && referenceText !== primary && referenceText !== fallbackSecondary ? (
      <UserIdentityMetaList
        items={[{ label: t("activity:ACTIVITY_FIELD_REFERENCE"), value: referenceText }]}
      />
    ) : null;

  return (
    <UserIdentityInline
      user={user ?? null}
      avatarSize={size}
      className="min-w-0"
      triggerSecondary={null}
      cardSecondary={fallbackSecondary || referenceText || null}
      cardDescription={cardDescription}
      triggerClassName="gap-2"
      primaryClassName="truncate text-footnote font-medium"
      secondaryClassName="truncate text-caption text-label-secondary"
    />
  );
}
