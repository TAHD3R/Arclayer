import { useTranslation } from "react-i18next";

import { Checkbox } from "@arclayer/ui/checkbox";
import { cn } from "@arclayer/lib/utils";

import type { ContentBootstrapCapabilityPackDefinition } from "../types";

export function ContentBootstrapCapabilityPackCard(props: {
  pack: ContentBootstrapCapabilityPackDefinition;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation("content");
  const Icon = props.pack.icon;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
        props.checked
          ? "border-primary/45 bg-primary/[0.07]"
          : "border-border/70 bg-background/80 hover:border-foreground/15 hover:bg-accent/35",
      )}
    >
      <Checkbox
        checked={props.checked}
        onCheckedChange={(value) => props.onCheckedChange(Boolean(value))}
      />
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background text-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-sm font-medium text-foreground">{t(props.pack.nameKey)}</span>
        <span className="block text-sm text-label-secondary">{t(props.pack.descriptionKey)}</span>
      </span>
    </label>
  );
}
