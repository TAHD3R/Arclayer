import type { ReactNode } from "react";

import { SettingPanel } from "@/components/settings-primitives/setting-panel";
import { cn } from "@celestial/lib/utils";

export type MeSettingPanelProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  showDivider?: boolean;
  dividerClassName?: string;
};

export function MeSettingPanel(props: MeSettingPanelProps) {
  const showDivider = props.showDivider ?? true;
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
