import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@arclayer/ui/sheet";
import { cn } from "@arclayer/lib/utils";

type SettingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
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
  bodyClassName,
}: SettingSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("w-[32.5rem] max-w-[92vw] gap-0 p-0", contentClassName)}
      >
        <SheetHeader className="px-6 py-5">
          <SheetTitle className="text-title3 font-semibold text-label-primary">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-body text-label-secondary">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>

        <div className={cn("min-w-0 flex-1 overflow-auto px-6 py-5", bodyClassName)}>
          {children}
        </div>

        {footer ? <SheetFooter>{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
