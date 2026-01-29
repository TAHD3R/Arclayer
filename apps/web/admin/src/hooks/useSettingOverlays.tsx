import * as React from "react";

import { SettingDialog } from "@/components/app/settingDialog";
import { SettingSheet } from "@/components/app/settingSheet";

export type SettingOverlayType = "dialog" | "sheet";

export type SettingOverlayRenderContext<K extends string> = {
  key: K;
  close: () => void;
};

export type SettingOverlayConfig<K extends string> = {
  key: K;
  type: SettingOverlayType;
  title: string;
  description?: React.ReactNode;
  contentClassName?: string;
  content: (ctx: SettingOverlayRenderContext<K>) => React.ReactNode;
  footer?: (ctx: SettingOverlayRenderContext<K>) => React.ReactNode;
};

/**
 * useSettingOverlays：为设置页的 Dialog/Sheet 提供“配置驱动”的统一开关与渲染。
 *
 * 设计目标：
 * - 统一 openKey 的状态管理（避免每个页面都手写一套 overlay state）
 * - 统一 onOpenChange 的关闭语义（关闭时自动清空 openKey）
 * - 通过 config 复用 overlay 的结构，页面只关心内容与 footer 行为
 */
export function useSettingOverlays<K extends string>(configs: readonly SettingOverlayConfig<K>[]) {
  const [openKey, setOpenKey] = React.useState<K | null>(null);

  const open = React.useCallback((key: K) => setOpenKey(key), []);
  const close = React.useCallback(() => setOpenKey(null), []);

  const renderOverlays = React.useCallback(() => {
    return configs.map((cfg) => {
      const isOpen = openKey === cfg.key;
      const ctx: SettingOverlayRenderContext<K> = { key: cfg.key, close };

      const commonProps = {
        open: isOpen,
        onOpenChange: (next: boolean) => {
          if (!next) close();
        },
        title: cfg.title,
        description: cfg.description,
        footer: cfg.footer?.(ctx),
        contentClassName: cfg.contentClassName,
        children: cfg.content(ctx),
      };

      return cfg.type === "dialog" ? (
        <SettingDialog key={cfg.key} {...commonProps} />
      ) : (
        <SettingSheet key={cfg.key} {...commonProps} />
      );
    });
  }, [close, configs, openKey]);

  return {
    openKey,
    open,
    close,
    renderOverlays,
  } as const;
}
