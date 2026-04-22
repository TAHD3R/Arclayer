import { ArrowLeft } from "lucide-react";

import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import { headerTriggerButtonClassName } from "@/components/layout/admin-workspace-switcher";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
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

function TopbarTrailing() {
  return (
    <div className="min-w-0 flex items-center justify-end gap-2">
      <AdminAccountMenu variant="header" />
    </div>
  );
}

export function AdminTopbar(props: {
  leadingMode?: AdminTopbarLeadingMode;
  backLabel?: string;
  onBack?: () => void;
  className?: string;
}) {
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
        <TopbarTrailing />
      </div>
    </header>
  );
}
