import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SettingPanelProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SettingPanel(props: SettingPanelProps) {
  return (
    <section className={cn("flex flex-col gap-3", props.className)}>
      <header className="flex flex-col gap-1">
        <div className="text-xl font-bold leading-tight">{props.title}</div>
        {props.description ? (
          <div className="text-[16px] text-muted-foreground leading-snug">{props.description}</div>
        ) : null}
      </header>
      <div className="rounded-xl border bg-background">{props.children}</div>
    </section>
  );
}
