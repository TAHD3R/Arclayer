import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@celestial/ui/dialog";
import { cn } from "@celestial/lib/utils";

export type ComplexDialogSize = "md" | "lg" | "xl" | "full";

const COMPLEX_DIALOG_SIZE_CLASSNAME: Record<ComplexDialogSize, string> = {
  md: cn("w-[90vw] max-w-[720px]", "h-[min(560px,calc(100vh-100px))]"),
  lg: cn("w-[90vw] max-w-[1100px]", "h-[min(652px,calc(100vh-100px))]"),
  xl: cn("w-[90vw] max-w-[1512px]", "h-[calc(100vh-100px)]"),
  full: cn("w-[90vw] max-w-[1512px]", "h-[calc(100vh-100px)]"),
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
  bodyClassName,
  footerClassName,
}: ComplexDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "min-w-0 overflow-hidden p-0",
          "border border-border shadow-xl",
          "rounded-[16px]",
          "max-h-[calc(100vh-100px)]",
          COMPLEX_DIALOG_SIZE_CLASSNAME[size],
          contentClassName,
        )}
      >
        <div className="flex min-w-0 flex-col">
          <DialogHeader
            className={cn(
              "min-w-0 border-b bg-background/80 px-6 py-4 text-left",
              "supports-[backdrop-filter]:backdrop-blur-sm",
              headerClassName,
            )}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle>{title}</DialogTitle>
                {description ? (
                  <DialogDescription className="mb-0">{description}</DialogDescription>
                ) : null}
              </div>
              {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
            </div>
          </DialogHeader>

          <div className={cn("min-w-0 flex-1 min-h-0 overflow-auto px-6 py-4", bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <DialogFooter
              className={cn("mt-0 min-w-0 border-t bg-card px-6 py-4", footerClassName)}
            >
              {footer}
            </DialogFooter>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
