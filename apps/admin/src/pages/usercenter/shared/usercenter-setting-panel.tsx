import type { ReactNode } from "react";

import { SettingPanel } from "@arclayer/ui/setting-panel";
import { cn } from "@arclayer/lib/utils";

export type UserCenterSettingPanelProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  variant?: "page" | "dialog";
  className?: string;
  bodyClassName?: string;
  showDivider?: boolean;
  dividerClassName?: string;
};

export function UserCenterSettingPanel(props: UserCenterSettingPanelProps) {
  const variant = props.variant ?? "page";
  const showDivider = props.showDivider ?? false;
  if (variant === "dialog") {
    return (
      <section className={cn("flex flex-col", props.className)}>
        <header className="pb-4 pt-1">
          <div className="text-title2 font-bold text-label-primary">{props.title}</div>
          {props.description ? (
            <div className="mt-1 text-label-secondary">{props.description}</div>
          ) : null}
        </header>
        {showDivider ? <div className={cn("h-px bg-border/50", props.dividerClassName)} /> : null}
        <div className={cn(showDivider ? "pt-4" : "pt-2", props.bodyClassName)}>
          {props.children}
        </div>
      </section>
    );
  }

  return (
    <SettingPanel
      title={props.title}
      description={props.description}
      bordered={false}
      className={cn("gap-2", props.className)}
    >
      {showDivider ? <div className={cn("h-px bg-border", props.dividerClassName)} /> : null}
      <div className={cn(showDivider ? "pt-4 pb-2" : "pt-2 pb-2", props.bodyClassName)}>
        {props.children}
      </div>
    </SettingPanel>
  );
}
