"use client";

import type * as React from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@celestial/ui/tooltip";

export function DataTableToolTooltip(props: { label: string; children: React.ReactElement }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{props.children}</TooltipTrigger>
        <TooltipContent>{props.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
