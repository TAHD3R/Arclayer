import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { UserAvatar } from "@/components/common/entity-avatar";

export type UserIdentity = {
  id?: string | null;
  userId?: string | null;
  username?: string | null;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type UserIdentityInlineProps = {
  user: UserIdentity | null;
  avatarSize?: number;
  triggerSecondary?: React.ReactNode;
  cardSecondary?: React.ReactNode;
  cardDescription?: React.ReactNode;
  cardBadges?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  triggerClassName?: string;
  infoClassName?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
  cardClassName?: string;
};

export function getUserIdentityPrimaryLabel(user: UserIdentity | null | undefined): string {
  if (!user) return "-";
  return (
    (user.displayName || user.username || user.email || user.userId || user.id || "-").trim() || "-"
  );
}

export function getUserIdentitySecondaryLabel(user: UserIdentity | null | undefined): string {
  if (!user) return "";
  const username = (user.username || "").trim();
  const referenceId = (user.userId || user.id || "").trim();
  const hasDisplayName = Boolean((user.displayName || "").trim());

  if (hasDisplayName) return username || referenceId;
  if (username && referenceId && referenceId !== username) return referenceId;
  return username || referenceId;
}

function hasRenderableContent(node: React.ReactNode): boolean {
  if (node === null || node === undefined || node === false) return false;
  if (typeof node === "string") return node.trim().length > 0;
  if (typeof node === "number") return true;
  if (Array.isArray(node)) return node.some(hasRenderableContent);
  return true;
}

function renderTriggerContent(props: {
  primary: string;
  secondary: React.ReactNode;
  avatarSize: number;
  avatarUrl: string | null | undefined;
  infoClassName?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
}) {
  return (
    <>
      <UserAvatar
        name={props.primary}
        assetRef={props.avatarUrl}
        size={props.avatarSize}
        className="shrink-0"
      />
      <div className={cn("min-w-0", props.infoClassName)}>
        <div className={cn("truncate text-headline text-label-primary", props.primaryClassName)}>
          {props.primary}
        </div>
        {hasRenderableContent(props.secondary) ? (
          <div className={cn("truncate text-label-secondary", props.secondaryClassName)}>
            {props.secondary}
          </div>
        ) : null}
      </div>
    </>
  );
}

function renderTriggerElement(props: {
  interactive: boolean;
  primary: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (props.interactive) {
    return (
      <button
        type="button"
        aria-label={props.primary}
        onClick={props.onClick}
        className={props.className}
        data-user-identity-trigger=""
      >
        {props.children}
      </button>
    );
  }

  return (
    <div className={props.className} data-user-identity-trigger="">
      {props.children}
    </div>
  );
}

export function UserIdentityInline(props: UserIdentityInlineProps) {
  if (!props.user) {
    return <span className="text-label-secondary">-</span>;
  }

  const primary = getUserIdentityPrimaryLabel(props.user);
  const triggerSecondary = props.triggerSecondary === undefined ? null : props.triggerSecondary;
  const interactive = Boolean(props.onClick);

  return (
    <div className={props.className}>
      {renderTriggerElement({
        interactive,
        primary,
        onClick: props.onClick,
        className: cn(
          "flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors",
          interactive
            ? "cursor-pointer hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            : null,
          props.triggerClassName,
        ),
        children: renderTriggerContent({
          primary,
          secondary: triggerSecondary,
          avatarSize: props.avatarSize ?? 24,
          avatarUrl: props.user.avatarUrl,
          infoClassName: props.infoClassName,
          primaryClassName: props.primaryClassName,
          secondaryClassName: props.secondaryClassName,
        }),
      })}
    </div>
  );
}
