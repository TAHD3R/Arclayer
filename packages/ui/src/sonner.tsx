"use client";

import {
  AlertCircleIcon,
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { cn } from "@arclayer/lib/utils";

import { buttonVariants } from "./button";

const TOAST_WIDTH = "min(28rem, calc(100vw - 2rem))";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const { closeButton, position, toastOptions, expand, visibleToasts, ...restProps } = props;
  const mergedToastOptions: ToasterProps["toastOptions"] = {
    ...toastOptions,
    classNames: {
      toast:
        "rounded-md border border-border/70 bg-popover text-popover-foreground !items-start !gap-3 !px-4 !py-3 !shadow-none [&_[data-content]]:pr-7",
      content: "grid flex-1 gap-0.5",
      title: "!text-headline !font-semibold !text-label-primary",
      description: "!text-callout !text-label-secondary",
      icon: "mt-0.5 shrink-0 self-start text-current [&_svg]:size-4",
      closeButton: cn(
        buttonVariants({ variant: "ghost", size: "icon-xs" }),
        "!left-auto !right-2.5 !top-2.5 !translate-x-0 !translate-y-0 !border-0 !bg-transparent !p-0 !text-label-secondary !shadow-none",
      ),
      success: "border-positive/25 [&_[data-icon]]:text-positive",
      error: "border-negative/25 [&_[data-icon]]:text-negative",
      warning: "border-warning/35 [&_[data-icon]]:text-warning",
      info: "border-primary/20 [&_[data-icon]]:text-primary",
      loading: "[&_[data-icon]]:text-primary",
      ...toastOptions?.classNames,
    },
  };

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={position ?? "top-right"}
      expand={expand ?? false}
      visibleToasts={visibleToasts ?? 3}
      closeButton={closeButton ?? true}
      className="toaster group "
      toastOptions={mergedToastOptions}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <AlertCircleIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--width": TOAST_WIDTH,
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--toast-icon-margin-start": "0px",
          "--toast-icon-margin-end": "0px",
          "--toast-svg-margin-start": "0px",
          "--toast-svg-margin-end": "0px",
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0.75rem",
          "--toast-close-button-transform": "none",
        } as React.CSSProperties
      }
      {...restProps}
    />
  );
};

export { Toaster };
