import { ArrowLeft, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import { headerTriggerButtonClassName } from "@/components/layout/admin-workspace-switcher";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

const TOPBAR_ICON_BUTTON_CLASSNAME = cn(
  "relative inline-flex size-10 items-center justify-center rounded-md border border-transparent",
  "bg-transparent text-label-secondary transition-[background-color,color,border-color] duration-200",
  "hover:bg-accent hover:text-label-primary",
  "data-[state=open]:border-border/60 data-[state=open]:bg-accent/70 data-[state=open]:text-label-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);
const TOPBAR_CONTENT_PADDING_CLASSNAME = "p-2";

type AdminTopbarLeadingMode = "none" | "logo" | "back";

function TopbarLeading(props: {
  leadingMode: AdminTopbarLeadingMode;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div className="min-w-0 flex items-center gap-2">
      {props.leadingMode === "back" ? (
        <ButtonPrimitive
          type="button"
          tapScale={1}
          aria-label={props.backLabel}
          onClick={props.onBack}
          className={cn(
            headerTriggerButtonClassName,
            "text-callout font-semibold text-label-primary",
            "active:border-border/60 active:bg-accent/70 active:text-label-primary",
          )}
        >
          <ArrowLeft className="size-4 shrink-0 opacity-80" aria-hidden="true" />
          <span className="truncate">{props.backLabel}</span>
        </ButtonPrimitive>
      ) : null}
    </div>
  );
}

function TopbarTrailing(props: {
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  notificationLabel: string;
  onNotificationToggle: () => void;
}) {
  return (
    <div className="min-w-0 flex items-center justify-end gap-2">
      <Tooltip>
        <TooltipTrigger asChild focusTrigger={false}>
          <ButtonPrimitive
            type="button"
            tapScale={1}
            aria-label={props.notificationLabel}
            data-state={props.notificationOpen ? "open" : "closed"}
            onClick={props.onNotificationToggle}
            className={TOPBAR_ICON_BUTTON_CLASSNAME}
          >
            <Bell className="size-4" aria-hidden="true" />
            {props.showNotificationsBadge && props.unreadCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold  text-primary-foreground">
                {props.unreadCount > 99 ? "99+" : props.unreadCount}
              </span>
            ) : null}
          </ButtonPrimitive>
        </TooltipTrigger>
        <TooltipContent>{props.notificationLabel}</TooltipContent>
      </Tooltip>

      <AdminAccountMenu variant="header" />
    </div>
  );
}

export function AdminTopbar(props: {
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  onNotificationToggle: () => void;
  leadingMode?: AdminTopbarLeadingMode;
  backLabel?: string;
  onBack?: () => void;
  className?: string;
}) {
  const { t } = useTranslation(["common", "notifications"]);
  const leadingMode = props.leadingMode ?? "none";

  return (
    <header className={cn("relative z-30 inset-y-auto", "bg-header", props.className)}>
      <div
        className={cn(
          "flex items-center gap-4",
          leadingMode === "none" ? "justify-end" : "justify-between",
          TOPBAR_CONTENT_PADDING_CLASSNAME,
        )}
      >
        {leadingMode !== "none" ? (
          <TopbarLeading
            leadingMode={leadingMode}
            backLabel={props.backLabel}
            onBack={props.onBack}
          />
        ) : null}
        <TopbarTrailing
          notificationOpen={props.notificationOpen}
          showNotificationsBadge={props.showNotificationsBadge}
          unreadCount={props.unreadCount}
          notificationLabel={t("notifications:NOTIFICATIONS_OPEN_CENTER")}
          onNotificationToggle={props.onNotificationToggle}
        />
      </div>
    </header>
  );
}
