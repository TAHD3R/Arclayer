import { useEffect, useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { cn } from "@arclayer/lib/utils";

type SettingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
};

/**
 * SettingDialog is a shared overlay wrapper for settings-like forms.
 * It keeps visual alignment with the base dialog primitives and ensures
 * a consistent header/body/footer structure.
 */
export function SettingDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
  bodyClassName,
}: SettingDialogProps) {
  const [titleSnapshot, setTitleSnapshot] = useState<ReactNode>(title);
  const [descriptionSnapshot, setDescriptionSnapshot] = useState<ReactNode>(description);

  useEffect(() => {
    if (!open) return;
    setTitleSnapshot(title);
    setDescriptionSnapshot(description);
  }, [description, open, title]);

  const displayTitle = open ? title : titleSnapshot;
  const displayDescription = open ? description : descriptionSnapshot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex min-w-0 max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 sm:max-w-2xl",
          contentClassName,
        )}
      >
        <DialogHeader className="min-w-0 border-b px-6 py-5 text-left">
          <DialogTitle className="text-title3 font-semibold text-label-primary">
            {displayTitle}
          </DialogTitle>
          {displayDescription ? (
            <DialogDescription className="mb-0 text-body text-label-secondary">
              {displayDescription}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5", bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <DialogFooter className="mt-0 min-w-0 border-t bg-card px-6 py-5">{footer}</DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
