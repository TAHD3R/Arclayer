"use client";

import * as React from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/common/toolbar";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

const FLOATING_BULK_BUTTON_BASE_CLASSNAME =
  "inline-flex items-center justify-center whitespace-nowrap text-footnote font-semibold transition-[box-shadow,_color,_background-color,_border-color,_outline-color,_text-decoration-color,_fill,_stroke] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

const FLOATING_BULK_ICON_BUTTON_CLASSNAME = cn(
  FLOATING_BULK_BUTTON_BASE_CLASSNAME,
  "size-10 rounded-md bg-transparent text-label-secondary hover:bg-accent hover:text-label-primary",
);

export type FloatingBulkToolbarAction = {
  key: string;
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  tooltip?: string;
  variant?: "default" | "destructive" | "ghost" | "secondary" | "outline";
};

type FloatingBulkToolbarProps = {
  visible: boolean;
  selectedLabel: string;
  clearLabel: string;
  onClear: () => void;
  actions: FloatingBulkToolbarAction[];
  className?: string;
};

function FloatingBulkToolbarActionButton(props: {
  action: FloatingBulkToolbarAction;
  className?: string;
}) {
  const { action } = props;
  const button = (
    <ButtonPrimitive
      type="button"
      aria-label={action.tooltip ?? action.label}
      className={cn(
        FLOATING_BULK_ICON_BUTTON_CLASSNAME,
        action.variant === "destructive"
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:text-label-primary",
        props.className,
      )}
      disabled={action.disabled}
      onClick={action.onClick}
      whileHover={{ y: -1, scale: 1.04 }}
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
    >
      {action.icon}
    </ButtonPrimitive>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild focusTrigger={false}>
        {button}
      </TooltipTrigger>
      <TooltipContent>{action.tooltip ?? action.label}</TooltipContent>
    </Tooltip>
  );
}

export function FloatingBulkToolbar(props: FloatingBulkToolbarProps) {
  const actions = React.useMemo(
    () => [
      {
        key: "__clear__",
        label: props.clearLabel,
        icon: <X className="size-4" />,
        onClick: props.onClear,
        variant: "ghost" as const,
      },
      ...props.actions,
    ],
    [props.actions, props.clearLabel, props.onClear],
  );

  return (
    <AnimatePresence initial={false}>
      {props.visible ? (
        <motion.div
          key="floating-bulk-toolbar"
          data-slot="floating-bulk-toolbar"
          className={cn(
            "pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 sm:px-6 lg:px-8",
            "bottom-[max(2rem,env(safe-area-inset-bottom))]",
            props.className,
          )}
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.82 }}
        >
          <TooltipProvider>
            <Toolbar className="pointer-events-auto max-w-full">
              <ToolbarGroup>
                <span className="text-callout font-semibold text-label-primary px-4 py-2">
                  {props.selectedLabel}
                </span>
              </ToolbarGroup>
              <ToolbarSeparator />
              {actions.length > 0 ? (
                <ToolbarGroup>
                  {actions.map((action) => (
                    <FloatingBulkToolbarActionButton key={action.key} action={action} />
                  ))}
                </ToolbarGroup>
              ) : null}
            </Toolbar>
          </TooltipProvider>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
