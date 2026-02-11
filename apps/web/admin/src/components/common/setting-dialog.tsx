import { useEffect, useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type SettingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
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
      <DialogContent className={cn("overflow-hidden p-0", contentClassName)}>
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle>{displayTitle}</DialogTitle>
          {displayDescription ? <DialogDescription>{displayDescription}</DialogDescription> : null}
        </DialogHeader>

        <div className="px-6 py-4">{children}</div>

        {footer ? <DialogFooter className="mt-0 border-t px-6 py-4">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
