import type { ReactNode } from "react";

import { Badge } from "@arclayer/ui/badge";
import { cn } from "@arclayer/lib/utils";

export function SystemSettingsStatusBadge(props: {
  tone?: "default" | "success" | "warning";
  children: ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        props.tone === "success"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
          : null,
        props.tone === "warning" ? "border-amber-500/30 bg-amber-500/10 text-amber-700" : null,
      )}
    >
      {props.children}
    </Badge>
  );
}
