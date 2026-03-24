import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@arclayer/ui/hover-card";
import { UserAvatar } from "@/components/common/entity-avatar";

const HOVER_CARD_OPEN_DELAY_MS = 120;
const HOVER_CARD_CLOSE_DELAY_MS = 80;
const HOVER_CARD_WIDTH_CLASSNAME = "w-[320px]";
const CARD_AVATAR_SIZE = 56;

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
  const email = (user.email || "").trim();
  const username = (user.username || "").trim();
  const referenceId = (user.userId || user.id || "").trim();
  const hasDisplayName = Boolean((user.displayName || "").trim());

  if (email) return email;
  if (hasDisplayName) return username || referenceId;
  if (username && referenceId && referenceId !== username) return referenceId;
  return referenceId;
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

function UserIdentityCard(props: {
  primary: string;
  secondary: React.ReactNode;
  avatarUrl: string | null | undefined;
  description?: React.ReactNode;
  badges?: React.ReactNode;
}) {
  return (
    <div className="p-4 text-popover-foreground">
      <div className="flex items-start gap-4">
        <UserAvatar
          name={props.primary}
          assetRef={props.avatarUrl}
          size={CARD_AVATAR_SIZE}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-headline text-label-primary">{props.primary}</div>
          {hasRenderableContent(props.secondary) ? (
            <div className="mt-1 truncate text-callout text-label-secondary">{props.secondary}</div>
          ) : null}
          {hasRenderableContent(props.description) ? (
            <div className="mt-3 text-caption leading-5 text-label-secondary">
              {props.description}
            </div>
          ) : null}
          {hasRenderableContent(props.badges) ? (
            <div className="mt-3 flex min-w-0 flex-wrap gap-1.5 *:max-w-full">{props.badges}</div>
          ) : null}
        </div>
      </div>
    </div>
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
  const defaultSecondary = getUserIdentitySecondaryLabel(props.user);
  const triggerSecondary =
    props.triggerSecondary === undefined ? defaultSecondary : props.triggerSecondary;
  const cardSecondary = props.cardSecondary === undefined ? defaultSecondary : props.cardSecondary;
  const interactive = Boolean(props.onClick);
  const hasHoverCard =
    hasRenderableContent(cardSecondary) ||
    hasRenderableContent(props.cardDescription) ||
    hasRenderableContent(props.cardBadges);
  const trigger = renderTriggerElement({
    interactive,
    primary,
    onClick: props.onClick,
    className: cn(
      "flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors",
      hasHoverCard ? "hover:bg-accent/45" : null,
      interactive ? "cursor-pointer" : hasHoverCard ? "cursor-default" : null,
      interactive
        ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  });

  if (!hasHoverCard) {
    return <div className={props.className}>{trigger}</div>;
  }

  return (
    <div className={props.className}>
      <HoverCard openDelay={HOVER_CARD_OPEN_DELAY_MS} closeDelay={HOVER_CARD_CLOSE_DELAY_MS}>
        <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="start"
          sideOffset={8}
          className={cn(
            HOVER_CARD_WIDTH_CLASSNAME,
            "rounded-xl border bg-popover p-0 text-popover-foreground shadow-md",
            props.cardClassName,
          )}
        >
          <UserIdentityCard
            primary={primary}
            secondary={cardSecondary}
            avatarUrl={props.user.avatarUrl}
            description={props.cardDescription}
            badges={props.cardBadges}
          />
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
