import { useMemo, type ReactNode } from "react";
import { Building2, FolderKanban } from "lucide-react";

import { cn } from "@celestial/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@celestial/ui/tooltip";
import { UserAvatar } from "@/components/common/entity-avatar";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags/tag-base";

export type MemberIdentity = {
  displayName: string | null;
  username: string;
  email: string | null;
  avatarUrl: string | null;
};

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

function getPrimaryLabel(member: MemberIdentity | null): string {
  if (!member) return "-";
  return (member.displayName || member.username || member.email || "-").trim() || "-";
}

function getSecondaryLabel(member: MemberIdentity | null): string {
  if (!member) return "";
  return member.email || member.username || "";
}

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

function MemberIdentityHoverCard(props: {
  primary: string;
  secondary: string;
  avatarUrl: string | null;
  scopeLabel?: string;
  scopeVariant?: "organization" | "workspace";
  roleLabel?: string;
  statusLabel?: string;
  description?: string;
  badges?: ReactNode;
}) {
  const renderedBadges = props.badges ?? [
    props.scopeLabel ? (
      <ScopeTag key="scope" label={props.scopeLabel} variant={props.scopeVariant} />
    ) : null,
    props.roleLabel ? <FallbackTag key="role" label={props.roleLabel} /> : null,
    props.statusLabel ? <FallbackTag key="status" label={props.statusLabel} /> : null,
  ];

  return (
    <div className="w-[320px] p-3 text-popover-foreground">
      <div className="flex items-start gap-4">
        <UserAvatar
          name={props.primary}
          assetRef={props.avatarUrl}
          size={64}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-headline text-label-primary">{props.primary}</div>
          {props.secondary ? (
            <div className="truncate text-callout text-label-secondary">{props.secondary}</div>
          ) : null}
          <div className="mt-3 flex min-w-0 flex-wrap gap-1.5 *:max-w-full">{renderedBadges}</div>
        </div>
      </div>
    </div>
  );
}

export function MemberIdentityCell(props: MemberIdentityCellProps) {
  const primary = useMemo(() => getPrimaryLabel(props.member), [props.member]);
  const secondary = useMemo(() => getSecondaryLabel(props.member), [props.member]);
  const hasHoverCard = Boolean(
    props.member &&
    (props.scopeLabel || props.roleLabel || props.statusLabel || props.description || props.badges),
  );

  if (!props.member) {
    return <span className="text-label-secondary">-</span>;
  }

  const trigger = (
    <button
      type="button"
      aria-label={primary}
      onClick={props.onOpenDetails}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors",
        "hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        props.onOpenDetails ? "cursor-pointer" : "cursor-default",
        props.className,
      )}
    >
      <UserAvatar name={primary} assetRef={props.member.avatarUrl} size={28} className="shrink-0" />
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{primary}</div>
        {secondary ? (
          <div className="text-caption truncate text-label-secondary">{secondary}</div>
        ) : null}
      </div>
    </button>
  );

  if (!hasHoverCard) {
    return trigger;
  }

  return (
    <TooltipProvider openDelay={80} closeDelay={40}>
      <Tooltip side="top" align="start" sideOffset={8}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="rounded-xl border bg-popover p-0 text-popover-foreground shadow-md [&>div]:p-0 [&>[data-slot=tooltip-arrow]]:hidden [&_[data-slot=tooltip-arrow]]:hidden">
          <MemberIdentityHoverCard
            primary={primary}
            secondary={secondary}
            avatarUrl={props.member.avatarUrl}
            scopeLabel={props.scopeLabel}
            scopeVariant={props.scopeVariant}
            roleLabel={props.roleLabel}
            statusLabel={props.statusLabel}
            description={props.description}
            badges={props.badges}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
