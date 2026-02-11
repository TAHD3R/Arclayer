import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SettingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
};

/**
 * SettingSheet：用于设置页的“侧边栏式”配置入口（替代 AntD Drawer）。
 * - 统一标题/描述/正文/底部按钮区布局
 * - 正文区域可滚动，避免大表单撑出视口
 */
export function SettingSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
}: SettingSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("w-130 max-w-[92vw] p-0 gap-0", contentClassName)}>
        <SheetHeader>
          <SheetTitle className="font-bold!">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-[16px]!">{description}</SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4">{children}</div>

        {footer ? <SheetFooter>{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
