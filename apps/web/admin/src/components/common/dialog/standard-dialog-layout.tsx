import type { ReactNode } from "react";

import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type StandardDialogLayoutProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
};

/**
 * Shared dialog body layout with unified header/footer borders and content spacing.
 * Keep input dialogs explicit with both title and description for accessibility and consistency.
 */
export function StandardDialogLayout({
  title,
  description,
  children,
  footer,
  headerClassName,
  bodyClassName,
  footerClassName,
}: StandardDialogLayoutProps) {
  return (
    <>
      <DialogHeader className={cn("px-6 pt-4 pb-4", headerClassName)}>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>

      <div className={cn("px-6 py-4", bodyClassName)}>{children}</div>

      {footer ? <DialogFooter className={cn("mt-0 px-6 py-4", footerClassName)}>{footer}</DialogFooter> : null}
    </>
  );
}
