import type { PropsWithChildren } from "react";

import { cn } from "@arclayer/lib/utils";

type MeSettingsSectionStackProps = PropsWithChildren<{
  mode?: "page" | "dialog";
  className?: string;
}>;

export function MeSettingsSectionStack(props: MeSettingsSectionStackProps) {
  const mode = props.mode ?? "page";

  return (
    <div
      className={cn(
        "min-w-0 flex flex-col",
        mode === "page" ? "gap-10 pb-12" : "gap-8 pb-3",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}
