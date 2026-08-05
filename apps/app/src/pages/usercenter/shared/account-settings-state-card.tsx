import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";

type AccountSettingsStateCardProps = {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: ReactNode;
  value?: string;
  tone?: "default" | "warning";
};

const TONE_CLASSNAME: Record<NonNullable<AccountSettingsStateCardProps["tone"]>, string> = {
  default: "border-border bg-card",
  warning: "border-amber-500/30 bg-amber-500/5",
};

export function UserCenterStateCard(props: AccountSettingsStateCardProps) {
  return (
    <section className={cn("rounded-2xl border p-5 ", TONE_CLASSNAME[props.tone ?? "default"])}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          {props.eyebrow ? (
            <div className="text-caption font-semibold text-label-secondary">{props.eyebrow}</div>
          ) : null}
          <div className="text-title3 font-semibold text-label-primary">{props.title}</div>
        </div>
        {props.icon ? (
          <div className="text-label-secondary [&>svg]:size-5">{props.icon}</div>
        ) : null}
      </div>

      {props.value ? (
        <div className="mt-4 text-largetitle font-semibold  text-label-primary">{props.value}</div>
      ) : null}

      <p className="mt-3 text-footnote  text-label-secondary">{props.description}</p>
    </section>
  );
}
