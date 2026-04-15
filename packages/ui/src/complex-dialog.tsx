import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { cn } from "@arclayer/lib/utils";

export type ComplexDialogSize = "md" | "lg" | "xl" | "full";

const COMPLEX_DIALOG_SIZE_CLASSNAME: Record<ComplexDialogSize, string> = {
  md: cn("w-[90vw] max-w-180", "h-[min(560px,calc(100vh-100px))]"),
  lg: cn("w-[90vw] max-w-275", "h-[min(652px,calc(100vh-100px))]"),
  xl: cn("w-[90vw] max-w-378", "h-[calc(100vh-100px)]"),
  full: cn("w-[90vw] max-w-378", "h-[calc(100vh-100px)]"),
};

export type ComplexDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headerRight?: ReactNode;
  size?: ComplexDialogSize;
  contentClassName?: string;
  headerClassName?: string;
  headerAlign?: "start" | "center";
  bodyClassName?: string;
  footerClassName?: string;
};

export function ComplexDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  headerRight,
  size = "lg",
  contentClassName,
  headerClassName,
  headerAlign = "start",
  bodyClassName,
  footerClassName,
}: ComplexDialogProps) {
  const centeredHeader = headerAlign === "center";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "min-w-0 overflow-hidden p-0",
          "border border-border ",
          "rounded-[16px]",
          "max-h-[calc(100vh-100px)]",
          COMPLEX_DIALOG_SIZE_CLASSNAME[size],
          contentClassName,
        )}
      >
        <div className="flex min-w-0 flex-col">
          <DialogHeader
            className={cn("min-w-0 border-b bg-card/92 px-6 py-5 text-left", headerClassName)}
          >
            <div
              className={cn(
                "min-w-0",
                centeredHeader
                  ? "relative flex min-h-9 items-center justify-center"
                  : "flex items-start justify-between gap-3",
              )}
            >
              <div
                className={cn(
                  "min-w-0",
                  centeredHeader ? "mx-auto w-full max-w-[calc(100%-11rem)] text-center" : "flex-1",
                )}
              >
                <DialogTitle
                  className={cn(
                    "text-title3 font-semibold text-label-primary",
                    centeredHeader && "text-center",
                  )}
                >
                  {title}
                </DialogTitle>
                {description ? (
                  <DialogDescription
                    className={cn(
                      "mb-0 text-body text-label-secondary",
                      centeredHeader && "text-center",
                    )}
                  >
                    {description}
                  </DialogDescription>
                ) : null}
              </div>
              {headerRight ? (
                <div
                  className={cn(
                    "shrink-0",
                    centeredHeader && "absolute top-1/2 right-0 -translate-y-1/2",
                  )}
                >
                  {headerRight}
                </div>
              ) : null}
            </div>
          </DialogHeader>

          <div className={cn("min-w-0 flex-1 min-h-0 overflow-auto px-6 py-5", bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <DialogFooter
              className={cn("mt-0 min-w-0 border-t bg-card px-6 py-5", footerClassName)}
            >
              {footer}
            </DialogFooter>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
