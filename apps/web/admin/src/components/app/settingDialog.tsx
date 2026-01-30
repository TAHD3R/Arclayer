import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/animate-ui/components/radix/dialog";
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
 * SettingDialog：用于设置页的“弹窗式”配置入口。
 * - 统一标题/描述/正文/底部按钮区布局
 * - 不强绑定具体表单库（AntD / RHF 均可）
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("p-0", contentClassName)}>
        <DialogHeader className="px-6 pt-4 border-b">
          <DialogTitle className="font-bold!">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-[16px]">{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="px-6 py-4">{children}</div>

        {footer ? <DialogFooter className="border-t px-6 py-4 ">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
