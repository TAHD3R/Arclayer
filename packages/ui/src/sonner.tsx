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

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const { position, toastOptions, ...restProps } = props;
  const mergedToastOptions: ToasterProps["toastOptions"] = {
    ...toastOptions,
    classNames: {
      toast:
        "rounded-md border border-border/70 bg-popover text-popover-foreground !w-[min(22rem,calc(100vw-2rem))] !items-start !gap-3 !px-4 !py-3 !shadow-none",
      content: "grid flex-1 gap-0.5",
      title: "!text-headline !font-semibold !leading-5 !text-label-primary",
      description: "!text-callout !leading-5 !text-label-secondary",
      icon: "mt-0.5 shrink-0 self-start text-current [&_svg]:size-4",
      closeButton:
        "border-border/60 bg-background text-label-secondary hover:bg-accent hover:text-label-primary",
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
      className="toaster group"
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
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--toast-icon-margin-start": "0px",
          "--toast-icon-margin-end": "0px",
          "--toast-svg-margin-start": "0px",
          "--toast-svg-margin-end": "0px",
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(35%, -35%)",
        } as React.CSSProperties
      }
      {...restProps}
    />
  );
};

export { Toaster };
