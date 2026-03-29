"use client";

import type { PlateElementProps } from "platejs/react";

import { useToggleButton, useToggleButtonState } from "@platejs/toggle/react";
import { ChevronRight } from "lucide-react";
import { PlateElement } from "platejs/react";

import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

export function ToggleElement(props: PlateElementProps) {
  const state = useToggleButtonState(String(props.element.id));
  const { buttonProps, open } = useToggleButton(state);

  return (
    <PlateElement {...props} className="relative pl-7">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="absolute left-0 top-0 size-6 rounded-md p-0 text-label-secondary hover:bg-accent/70"
        contentEditable={false}
        {...buttonProps}
      >
        <ChevronRight
          className={cn("size-4 transition-transform duration-150", open && "rotate-90")}
        />
      </Button>
      {props.children}
    </PlateElement>
  );
}
