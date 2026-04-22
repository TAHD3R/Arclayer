import { LayoutGrid, List } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

const VIEW_MODE_OPTIONS = [
  { value: "card", labelKey: "common:VIEW_MODE_CARD", Icon: LayoutGrid },
  { value: "table", labelKey: "common:VIEW_MODE_TABLE", Icon: List },
] as const;

export type ViewMode = (typeof VIEW_MODE_OPTIONS)[number]["value"];

type ViewModeToggleProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  value: ViewMode;
  onChange: (next: ViewMode) => void;
};

function isViewMode(value: string): value is ViewMode {
  return value === "card" || value === "table";
}

export function ViewModeToggle({ t, value, onChange }: ViewModeToggleProps) {
  const labels = VIEW_MODE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
    Icon: option.Icon,
  }));

  return (
    <TooltipProvider>
      <ToggleGroup
        type="single"
        variant="outline"
        value={value}
        aria-label={labels.map((option) => option.label).join(", ")}
        onValueChange={(next) => {
          if (!isViewMode(next)) return;
          onChange(next);
        }}
      >
        {labels.map(({ value: optionValue, label, Icon }) => (
          <Tooltip key={optionValue}>
            <TooltipTrigger asChild focusTrigger={false}>
              <ToggleGroupItem
                value={optionValue}
                aria-label={label}
                data-view-mode-state={value === optionValue ? "on" : "off"}
                className="min-w-0 px-2.5 data-[view-mode-state=on]:border-border/80 data-[view-mode-state=on]:bg-accent data-[view-mode-state=on]:text-accent-foreground"
              >
                <Icon className="size-4" aria-hidden="true" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  );
}
