import { type ReactNode } from "react";
import { Building2, FolderKanban } from "lucide-react";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags/tag-base";
import { UserIdentityInline, type UserIdentity } from "./user-identity";

export type MemberIdentity = Pick<UserIdentity, "displayName" | "username" | "email" | "avatarUrl">;

export type MemberIdentityCellProps = {
  member: MemberIdentity | null;
  scopeLabel?: string;
  scopeVariant?: "organization" | "workspace";
  roleLabel?: string;
  statusLabel?: string;
  description?: string;
  badges?: ReactNode;
  onOpenDetails?: () => void;
  className?: string;
};

const HOVER_TAG_CLASSNAMES = {
  root: "!mr-0 !inline-flex !max-w-full overflow-hidden",
  content: "!min-w-0 !max-w-full overflow-hidden",
} as const;

function ScopeTag(props: { label: string; variant?: "organization" | "workspace" }) {
  const Icon = props.variant === "workspace" ? FolderKanban : Building2;
  return (
    <BaseTag classNames={HOVER_TAG_CLASSNAMES} icon={lucideTagIcon(Icon)} className="!bg-muted/70">
      <span className="truncate">{props.label}</span>
    </BaseTag>
  );
}

function FallbackTag(props: { label: string }) {
  return (
    <BaseTag classNames={HOVER_TAG_CLASSNAMES} className="!bg-muted/70">
      <span className="truncate">{props.label}</span>
    </BaseTag>
  );
}

export function MemberIdentityCell(props: MemberIdentityCellProps) {
  const renderedBadges = props.badges ?? [
    props.scopeLabel ? (
      <ScopeTag key="scope" label={props.scopeLabel} variant={props.scopeVariant} />
    ) : null,
    props.roleLabel ? <FallbackTag key="role" label={props.roleLabel} /> : null,
    props.statusLabel ? <FallbackTag key="status" label={props.statusLabel} /> : null,
  ];

  return (
    <UserIdentityInline
      user={props.member}
      avatarSize={28}
      cardDescription={props.description}
      cardBadges={renderedBadges}
      onClick={props.onOpenDetails}
      className={props.className}
      triggerClassName="gap-3"
      primaryClassName="truncate font-medium text-foreground"
      secondaryClassName="truncate text-caption text-label-secondary"
    />
  );
}
