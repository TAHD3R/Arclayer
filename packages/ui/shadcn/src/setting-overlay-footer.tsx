import type { ReactNode } from "react";

import { Button } from "antd";

type AsyncAction = () => void | Promise<void>;

type SettingOverlayFooterProps = {
  /**
   * close：由外部 overlay 控制器提供，统一关闭 overlay。
   */
  close: () => void;

  /**
   * 关闭按钮文案（一般是“返回”）。
   */
  backText: ReactNode;

  /**
   * 保存按钮文案（一般是“保存”）。
   */
  saveText: ReactNode;

  /**
   * 保存动作：成功后自动 close；失败则保持打开。
   */
  onSave: AsyncAction;
  saveLoading?: boolean;

  /**
   * 可选重置动作：成功后自动 close；失败则保持打开。
   */
  onReset?: AsyncAction;
  resetText?: ReactNode;
  resetVisible?: boolean;
  resetLoading?: boolean;

  disabled?: boolean;
};

/**
 * SettingOverlayFooter：设置页 overlay（Dialog/Sheet）底部按钮区的统一实现。
 *
 * 约定：
 * - back：总是关闭
 * - save/reset：成功关闭，失败保持打开（便于用户修正表单/重试）
 */
export function SettingOverlayFooter({
  close,
  backText,
  saveText,
  onSave,
  saveLoading,
  onReset,
  resetText,
  resetVisible,
  resetLoading,
  disabled,
}: SettingOverlayFooterProps) {
  const shouldShowReset = Boolean(resetVisible && onReset);
  if (shouldShowReset && (resetText === undefined || resetText === null)) {
    throw new Error("SettingOverlayFooter: resetText is required when reset is enabled.");
  }

  const handleSave = async () => {
    await onSave();
    close();
  };

  const handleReset = async () => {
    if (!onReset) return;
    await onReset();
    close();
  };

  return (
    <div className="flex w-full items-center justify-end gap-2">
      <Button
        type="text"
        onClick={close}
        disabled={Boolean(disabled || saveLoading || resetLoading)}
        autoInsertSpace={false}
      >
        {backText}
      </Button>

      {shouldShowReset ? (
        <Button
          type="default"
          disabled={Boolean(disabled || resetLoading || saveLoading)}
          onClick={() => void handleReset()}
          loading={Boolean(resetLoading)}
          autoInsertSpace={false}
        >
          {resetText}
        </Button>
      ) : null}

      <Button
        disabled={Boolean(disabled || saveLoading || resetLoading)}
        onClick={() => void handleSave()}
        type="primary"
        loading={Boolean(saveLoading)}
        autoInsertSpace={false}
      >
        {saveText}
      </Button>
    </div>
  );
}
