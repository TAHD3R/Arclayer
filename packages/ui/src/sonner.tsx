"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
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
        "rounded-xl border border-border/70 bg-popover text-popover-foreground shadow-lg shadow-black/5",
      content: "grid gap-1.5",
      title: "!text-headline !text-current",
      description: "!text-callout text-current/80",
      icon: "mt-0.5 shrink-0 text-current",
      closeButton:
        "border-border/60 bg-background text-label-secondary hover:bg-accent hover:text-label-primary",
      success: "border-positive/25 text-positive",
      error: "border-negative/25 text-negative",
      warning: "border-warning/35 text-warning",
      info: "border-primary/20 text-primary",
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
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
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
