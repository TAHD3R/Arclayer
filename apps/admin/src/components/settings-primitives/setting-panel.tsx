import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SettingPanelProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Whether to wrap children in a bordered card container.
   * - true (default): consistent with most setting panels
   * - false: used when children already manage their own layout (e.g. accordions)
   */
  bordered?: boolean;
};

export function SettingPanel(props: SettingPanelProps) {
  const bordered = props.bordered ?? true;
  return (
    <section className={cn("flex flex-col gap-3", props.className)}>
      <header className="flex flex-col gap-1">
        <div className="text-title2 font-bold leading-tight">{props.title}</div>
        {props.description ? (
          <div className="text-body text-label-secondary">{props.description}</div>
        ) : null}
      </header>
      {bordered ? <div className="bg-background">{props.children}</div> : props.children}
    </section>
  );
}
