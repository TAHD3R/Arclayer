import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type SettingDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
  titleClassName?: string;
  preventInitialFocus?: boolean;
}>;

export function SettingDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
  bodyClassName,
  titleClassName,
  preventInitialFocus = true,
}: SettingDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl",
          contentClassName,
        )}
        onOpenAutoFocus={
          preventInitialFocus
            ? (event) => {
                event.preventDefault();
              }
            : undefined
        }
      >
        <DialogHeader className="min-w-0 space-y-2 border-b px-6 py-5 text-left">
          <DialogTitle className={cn("text-lg font-semibold", titleClassName)}>{title}</DialogTitle>
          {description ? (
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground">{description}</div>
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-5",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <DialogFooter className="mt-0 min-w-0 border-t px-6 py-4">{footer}</DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
