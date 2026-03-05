"use client";

import { SlidersHorizontal } from "lucide-react";
import * as React from "react";

import { cn } from "@celestial/lib/utils";
import {
  DropdownCardBody,
  DropdownCardContent,
  DropdownCardHeader,
  DropdownCardRoot,
  DropdownCardTrigger,
} from "@celestial/ui/dropdown-card";

import { DataTableDefaultIconButton } from "./data-table-icon-button";
import type {
  DataTableIconButtonProps,
  DataTableToolsComponents,
  DataTableToolsLabels,
} from "./data-table-tools.types";
import { DataTableToolTooltip } from "./data-table-tool-tooltip";
import type { DataTableDensity } from "./types";

const ICON_CLASS = "size-4";

function clampDensity(value: DataTableDensity): DataTableDensity {
  if (value === "compact") return "compact";
  if (value === "relaxed") return "relaxed";
  return "default";
}

function DensityPreview(props: { density: DataTableDensity }) {
  const rowClass =
    props.density === "compact" ? "h-5" : props.density === "relaxed" ? "h-9" : "h-7";

  return (
    <div className="rounded-md border bg-background p-2">
      <div className="h-2.5 w-2/3 rounded bg-muted/70" />
      <div className="mt-2 space-y-1">
        <div className={cn("rounded bg-muted/40", rowClass)} />
        <div className={cn("rounded bg-muted/40", rowClass)} />
        <div className={cn("rounded bg-muted/40", rowClass)} />
      </div>
    </div>
  );
}

function DensityCardButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  density: DataTableDensity;
}) {
  return (
    <button
      type="button"
      className={cn(
        "group w-full text-left rounded-xl border p-3 transition-colors",
        props.active ? "border-ring bg-accent/40" : "border-border hover:bg-accent/30",
      )}
      onClick={props.onClick}
    >
      <div className="text-footnote font-medium">{props.label}</div>
      <div className="mt-2">
        <DensityPreview density={props.density} />
      </div>
    </button>
  );
}

function resolveIconButton(components: DataTableToolsComponents | undefined) {
  return (components?.IconButton ?? DataTableDefaultIconButton) as React.ComponentType<
    DataTableIconButtonProps & { className?: string }
  >;
}

export function DataTableDensityCard(props: {
  value: DataTableDensity;
  onChange: (next: DataTableDensity) => void;
  labels: Pick<
    DataTableToolsLabels,
    "density" | "densityCompact" | "densityDefault" | "densityRelaxed"
  >;
  components?: DataTableToolsComponents;
}) {
  const [open, setOpen] = React.useState(false);
  const IconButton = resolveIconButton(props.components);

  const choose = React.useCallback(
    (next: DataTableDensity) => {
      props.onChange(clampDensity(next));
      setOpen(false);
    },
    [props],
  );

  return (
    <DropdownCardRoot open={open} onOpenChange={setOpen}>
      <DropdownCardTrigger asChild>
        <span className="inline-flex">
          <DataTableToolTooltip label={props.labels.density}>
            <IconButton label={props.labels.density}>
              <SlidersHorizontal className={ICON_CLASS} />
            </IconButton>
          </DataTableToolTooltip>
        </span>
      </DropdownCardTrigger>

      <DropdownCardContent align="end" sideOffset={8} className="w-[520px] max-w-[90vw]">
        <DropdownCardHeader className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-semibold">{props.labels.density}</div>
            <div className="text-footnote text-label-secondary">
              {props.value === "compact"
                ? props.labels.densityCompact
                : props.value === "relaxed"
                  ? props.labels.densityRelaxed
                  : props.labels.densityDefault}
            </div>
          </div>
        </DropdownCardHeader>

        <DropdownCardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DensityCardButton
              label={props.labels.densityCompact}
              density="compact"
              active={props.value === "compact"}
              onClick={() => choose("compact")}
            />
            <DensityCardButton
              label={props.labels.densityDefault}
              density="default"
              active={props.value === "default"}
              onClick={() => choose("default")}
            />
            <DensityCardButton
              label={props.labels.densityRelaxed}
              density="relaxed"
              active={props.value === "relaxed"}
              onClick={() => choose("relaxed")}
            />
          </div>
        </DropdownCardBody>
      </DropdownCardContent>
    </DropdownCardRoot>
  );
}
