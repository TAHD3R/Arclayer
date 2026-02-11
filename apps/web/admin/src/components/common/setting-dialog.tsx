import type { ReactNode } from "react";

import { StandardDialogLayout } from "@/components/common/dialog/standard-dialog-layout";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
        <StandardDialogLayout
          title={title}
          description={description}
          footer={footer}
          headerClassName="text-left"
          bodyClassName="py-4"
        >
          {children}
        </StandardDialogLayout>
      </DialogContent>
    </Dialog>
  );
}
