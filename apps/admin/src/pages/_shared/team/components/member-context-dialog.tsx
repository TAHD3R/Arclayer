import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, FolderKanban } from "lucide-react";

import { cn } from "@celestial/lib/utils";
import { Button } from "@celestial/ui/button";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@celestial/ui/chrome-tabs";
import { ComplexDialog } from "@celestial/ui/complex-dialog";
import { UserAvatar } from "@/components/common/entity-avatar";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags/tag-base";
import type { MemberIdentity } from "./member-identity-cell";

export type MemberContextDialogTab = {
  key: string;
  label: string;
  content: ReactNode;
};

export type MemberContextDialogAction = {
  key: string;
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
};

export type MemberContextDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialogTitle: ReactNode;
  dialogDescription?: ReactNode;
  member: MemberIdentity | null;
  scopeLabel: string;
  scopeVariant?: "organization" | "workspace";
  summary?: ReactNode;
  badges?: ReactNode;
  actionButtons?: readonly MemberContextDialogAction[];
  tabs: readonly MemberContextDialogTab[];
  defaultTabKey?: string;
};

const HEADER_SCOPE_TAG_CLASSNAMES = {
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

function HeaderScopeTag(props: { label: string; variant?: "organization" | "workspace" }) {
  const Icon = props.variant === "workspace" ? FolderKanban : Building2;
  return (
    <BaseTag
      classNames={HEADER_SCOPE_TAG_CLASSNAMES}
      icon={lucideTagIcon(Icon)}
      className="!bg-muted/70"
    >
      <span className="truncate">{props.label}</span>
    </BaseTag>
  );
}

function renderActionButtons(actions: readonly MemberContextDialogAction[] | undefined) {
  if (!actions?.length) return null;
  const count = actions.length;

  return (
    <div className="flex items-center gap-2">
      {actions.map((action, index) => {
        const variant = action.danger
          ? "destructive"
          : count === 1 || index === 0
            ? "default"
            : "ghost";
        return (
          <Button
            key={action.key}
            variant={variant}
            disabled={action.disabled}
            loading={action.loading}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

export function MemberContextDialog(props: MemberContextDialogProps) {
  const initialTab = props.defaultTabKey ?? props.tabs[0]?.key ?? "overview";
  const [activeTab, setActiveTab] = useState(initialTab);
  const primary = useMemo(() => getPrimaryLabel(props.member), [props.member]);
  const secondary = useMemo(() => getSecondaryLabel(props.member), [props.member]);

  useEffect(() => {
    if (!props.open) return;
    setActiveTab(props.defaultTabKey ?? props.tabs[0]?.key ?? "overview");
  }, [props.defaultTabKey, props.open, props.tabs]);

  return (
    <ComplexDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      size="xl"
      title={props.dialogTitle}
      description={props.dialogDescription}
      contentClassName={cn(
        "rounded-[14px]",
        "w-[90vw]! max-w-[1240px]!",
        "h-[calc(100%-100px)]! max-h-[calc(100%-100px)]!",
        "[&>div]:h-full [&>div]:min-h-0",
      )}
      bodyClassName="flex h-full min-h-0 flex-col gap-0 overflow-hidden p-0!"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <div className="border-b bg-gradient-to-b from-muted/40 to-background px-7 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 flex-1 items-center gap-4 pb-5">
              <UserAvatar
                name={primary}
                assetRef={props.member?.avatarUrl}
                size={72}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-title2 font-bold text-foreground">{primary}</div>
                {secondary ? (
                  <div className="truncate text-callout text-label-secondary">{secondary}</div>
                ) : null}
                <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 [&>*]:max-w-full">
                  <HeaderScopeTag label={props.scopeLabel} variant={props.scopeVariant} />
                  {props.badges}
                </div>
              </div>
            </div>

            {props.actionButtons?.length ? (
              <div className="shrink-0 pb-5">{renderActionButtons(props.actionButtons)}</div>
            ) : null}
          </div>
        </div>

        <ChromeTabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b px-7">
            <ChromeTabsList className="w-auto shrink-0">
              {props.tabs.map((tab) => (
                <ChromeTabsTrigger key={tab.key} value={tab.key}>
                  {tab.label}
                </ChromeTabsTrigger>
              ))}
            </ChromeTabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-7 py-5">
            {props.tabs.map((tab) => (
              <ChromeTabsContent
                key={tab.key}
                value={tab.key}
                className="flex h-full min-h-0 flex-1 flex-col !pt-0 data-[state=inactive]:hidden"
              >
                {tab.content}
              </ChromeTabsContent>
            ))}
          </div>
        </ChromeTabs>
      </div>
    </ComplexDialog>
  );
}
